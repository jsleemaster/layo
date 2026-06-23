use crate::{
    config::{AccessMode, AuthError, RelayConfig, UpgradeTarget},
    room::{RelayHub, RoomError},
};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use std::{collections::HashMap, net::SocketAddr};
use thiserror::Error;

#[derive(Clone)]
struct AppState {
    config: RelayConfig,
    hub: RelayHub,
}

#[derive(Debug, Error)]
pub enum ServerError {
    #[error("invalid listen address")]
    InvalidAddress,
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Error)]
pub enum ParseUpgradeError {
    #[error("invalid access mode")]
    InvalidAccessMode,
}

pub fn build_router(config: RelayConfig, hub: RelayHub) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/{*room_id}", get(upgrade_websocket))
        .with_state(AppState { config, hub })
}

pub async fn run(config: RelayConfig) -> Result<(), ServerError> {
    let address = format!("{}:{}", config.host, config.port)
        .parse::<SocketAddr>()
        .map_err(|_| ServerError::InvalidAddress)?;
    let listener = tokio::net::TcpListener::bind(address).await?;
    println!(
        "Canvas Rust collaboration relay listening at ws://{}",
        address
    );
    axum::serve(listener, build_router(config, RelayHub::default())).await?;
    Ok(())
}

pub fn parse_upgrade_target(
    room_id: String,
    query: &[(String, String)],
) -> Result<UpgradeTarget, ParseUpgradeError> {
    let params = query.iter().cloned().collect::<HashMap<_, _>>();
    let access = match params.get("access").map(String::as_str) {
        Some("awareness") => AccessMode::Awareness,
        Some("sync") | None => AccessMode::Sync,
        Some(_) => return Err(ParseUpgradeError::InvalidAccessMode),
    };

    Ok(UpgradeTarget {
        room_id,
        token: params.get("token").cloned(),
        user_id: params.get("userId").cloned(),
        member_token: params.get("memberToken").cloned(),
        access,
        encrypted: params.get("e2ee").map(String::as_str) == Some("true"),
    })
}

async fn health() -> &'static str {
    "ok"
}

async fn upgrade_websocket(
    State(state): State<AppState>,
    Path(room_id): Path<String>,
    Query(query): Query<HashMap<String, String>>,
    ws: WebSocketUpgrade,
) -> Response {
    let query_pairs = query.into_iter().collect::<Vec<_>>();
    let target = match parse_upgrade_target(room_id, &query_pairs) {
        Ok(target) => target,
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };
    let authorization = match state.config.validate_upgrade(&target) {
        Ok(authorization) => authorization,
        Err(error) => return status_for_auth_error(error).into_response(),
    };

    ws.on_upgrade(move |socket| {
        handle_socket(
            socket,
            state.hub,
            target.room_id,
            authorization.can_write_document,
        )
    })
}

async fn handle_socket(
    socket: WebSocket,
    hub: RelayHub,
    room_id: String,
    can_write_document: bool,
) {
    let mut peer = hub.connect(room_id, can_write_document).await;
    let (mut sender, mut receiver) = socket.split();

    loop {
        tokio::select! {
            incoming = receiver.next() => {
                match incoming {
                    Some(Ok(Message::Binary(bytes))) => {
                        if should_close_on_room_error(hub.handle_frame(&peer, bytes.to_vec()).await) {
                            break;
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
                }
            }
            outbound = peer.recv() => {
                let Some(frame) = outbound else {
                    break;
                };
                if sender.send(Message::Binary(frame.into())).await.is_err() {
                    break;
                }
            }
        }
    }
}

fn should_close_on_room_error(result: Result<(), RoomError>) -> bool {
    result.is_err()
}

fn status_for_auth_error(error: AuthError) -> StatusCode {
    match error {
        AuthError::EncryptedRoomsOnly => StatusCode::UPGRADE_REQUIRED,
        AuthError::RoomPrefixRejected
        | AuthError::RoomTokenRequired
        | AuthError::InvalidRoomToken
        | AuthError::MemberCredentialsRequired
        | AuthError::InvalidMemberToken => StatusCode::UNAUTHORIZED,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        config::{AccessMode, RelayConfig},
        room::RelayHub,
    };
    use axum::{body::Body, http};
    use tower::ServiceExt;

    #[tokio::test]
    async fn health_route_returns_ok() {
        let app = build_router(RelayConfig::default(), RelayHub::default());
        let response = app
            .oneshot(
                http::Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), http::StatusCode::OK);
    }

    #[test]
    fn parses_upgrade_targets_from_query() {
        let target = parse_upgrade_target(
            "layo:team:doc".to_string(),
            &[
                ("e2ee".to_string(), "true".to_string()),
                ("access".to_string(), "awareness".to_string()),
                ("userId".to_string(), "viewer-1".to_string()),
                ("memberToken".to_string(), "viewer-secret".to_string()),
            ],
        )
        .expect("target parses");

        assert_eq!(target.room_id, "layo:team:doc");
        assert!(target.encrypted);
        assert_eq!(target.access, AccessMode::Awareness);
        assert_eq!(target.user_id.as_deref(), Some("viewer-1"));
    }
}
