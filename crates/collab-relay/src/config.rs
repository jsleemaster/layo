use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use thiserror::Error;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RelayConfig {
    pub host: String,
    pub port: u16,
    pub allowed_room_prefix: String,
    room_token_hash: Option<String>,
    member_tokens: Vec<MemberToken>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RelayRole {
    Owner,
    Editor,
    Viewer,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AccessMode {
    Sync,
    Awareness,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UpgradeTarget {
    pub room_id: String,
    pub token: Option<String>,
    pub user_id: Option<String>,
    pub member_token: Option<String>,
    pub access: AccessMode,
    pub encrypted: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Authorization {
    pub can_write_document: bool,
}

#[derive(Debug, Error, Eq, PartialEq)]
pub enum ConfigError {
    #[error("invalid relay port")]
    InvalidPort,
    #[error("invalid member token config: {0}")]
    InvalidMemberTokens(String),
}

#[derive(Debug, Error, Eq, PartialEq)]
pub enum AuthError {
    #[error("rust relay v1 only supports encrypted rooms")]
    EncryptedRoomsOnly,
    #[error("room id does not match allowed prefix")]
    RoomPrefixRejected,
    #[error("relay room token is required")]
    RoomTokenRequired,
    #[error("relay room token is invalid")]
    InvalidRoomToken,
    #[error("member credentials are required")]
    MemberCredentialsRequired,
    #[error("member credentials are invalid")]
    InvalidMemberToken,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct MemberToken {
    user_id: String,
    token_hash: String,
    role: RelayRole,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MemberTokenInput {
    user_id: String,
    token: Option<String>,
    token_hash: Option<String>,
    role: RelayRoleInput,
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum RelayRoleInput {
    Owner,
    Editor,
    Viewer,
}

impl Default for RelayConfig {
    fn default() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 4327,
            allowed_room_prefix: "layo".to_string(),
            room_token_hash: None,
            member_tokens: Vec::new(),
        }
    }
}

impl RelayConfig {
    pub fn from_env_vars(
        vars: impl IntoIterator<Item = (String, String)>,
    ) -> Result<Self, ConfigError> {
        let vars = vars.into_iter().collect::<HashMap<_, _>>();
        let mut config = Self::default();

        if let Some(host) = vars
            .get("COLLAB_RELAY_HOST")
            .filter(|value| !value.trim().is_empty())
        {
            config.host = host.trim().to_string();
        }
        if let Some(port) = vars
            .get("COLLAB_RELAY_PORT")
            .filter(|value| !value.trim().is_empty())
        {
            config.port = port.parse::<u16>().map_err(|_| ConfigError::InvalidPort)?;
        }
        if let Some(prefix) = vars
            .get("COLLAB_ALLOWED_ROOM_PREFIX")
            .filter(|value| !value.trim().is_empty())
        {
            config.allowed_room_prefix = prefix.trim().to_string();
        }
        config.room_token_hash = vars
            .get("COLLAB_ROOM_TOKEN_HASH")
            .filter(|value| !value.trim().is_empty())
            .map(|value| value.trim().to_ascii_lowercase())
            .or_else(|| {
                vars.get("COLLAB_ROOM_TOKEN")
                    .filter(|value| !value.trim().is_empty())
                    .map(|value| sha256_hex(value.trim()))
            });
        if let Some(raw_members) = vars
            .get("COLLAB_MEMBER_TOKENS")
            .filter(|value| !value.trim().is_empty())
        {
            let parsed = serde_json::from_str::<Vec<MemberTokenInput>>(raw_members)
                .map_err(|error| ConfigError::InvalidMemberTokens(error.to_string()))?;
            let mut member_tokens = Vec::new();
            for member in parsed {
                let token_hash = match (
                    member
                        .token_hash
                        .as_deref()
                        .map(str::trim)
                        .filter(|value| !value.is_empty()),
                    member
                        .token
                        .as_deref()
                        .map(str::trim)
                        .filter(|value| !value.is_empty()),
                ) {
                    (Some(token_hash), _) => token_hash.to_ascii_lowercase(),
                    (None, Some(token)) => sha256_hex(token),
                    (None, None) => {
                        return Err(ConfigError::InvalidMemberTokens(
                            "member token or tokenHash is required".to_string(),
                        ));
                    }
                };
                member_tokens.push(MemberToken {
                    user_id: member.user_id,
                    token_hash,
                    role: member.role.into(),
                });
            }
            config.member_tokens = member_tokens;
        }

        Ok(config)
    }

    pub fn from_current_env() -> Result<Self, ConfigError> {
        Self::from_env_vars(std::env::vars())
    }

    pub fn validate_upgrade(&self, target: &UpgradeTarget) -> Result<Authorization, AuthError> {
        if !target.encrypted {
            return Err(AuthError::EncryptedRoomsOnly);
        }
        if !target
            .room_id
            .starts_with(&format!("{}:", self.allowed_room_prefix))
        {
            return Err(AuthError::RoomPrefixRejected);
        }
        if let Some(expected_hash) = &self.room_token_hash {
            let token = target
                .token
                .as_deref()
                .ok_or(AuthError::RoomTokenRequired)?;
            if sha256_hex(token) != *expected_hash {
                return Err(AuthError::InvalidRoomToken);
            }
        }

        let role = if self.member_tokens.is_empty() {
            None
        } else {
            let user_id = target
                .user_id
                .as_deref()
                .ok_or(AuthError::MemberCredentialsRequired)?;
            let member_token = target
                .member_token
                .as_deref()
                .ok_or(AuthError::MemberCredentialsRequired)?;
            let member_hash = sha256_hex(member_token);
            let member = self
                .member_tokens
                .iter()
                .find(|member| member.user_id == user_id && member.token_hash == member_hash)
                .ok_or(AuthError::InvalidMemberToken)?;
            Some(member.role)
        };

        Ok(Authorization {
            can_write_document: target.access == AccessMode::Sync
                && role.map(|role| role.can_write_document()).unwrap_or(true),
        })
    }
}

impl RelayRole {
    fn can_write_document(self) -> bool {
        matches!(self, Self::Owner | Self::Editor)
    }
}

impl From<RelayRoleInput> for RelayRole {
    fn from(value: RelayRoleInput) -> Self {
        match value {
            RelayRoleInput::Owner => Self::Owner,
            RelayRoleInput::Editor => Self::Editor,
            RelayRoleInput::Viewer => Self::Viewer,
        }
    }
}

fn sha256_hex(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_room_prefix_and_plain_room_token() {
        let config = RelayConfig::from_env_vars([
            (
                "COLLAB_ALLOWED_ROOM_PREFIX".to_string(),
                "layo".to_string(),
            ),
            ("COLLAB_ROOM_TOKEN".to_string(), "room-secret".to_string()),
        ])
        .expect("config parses");

        let auth = config
            .validate_upgrade(&UpgradeTarget {
                room_id: "layo:team:doc".to_string(),
                token: Some("room-secret".to_string()),
                user_id: None,
                member_token: None,
                access: AccessMode::Sync,
                encrypted: true,
            })
            .expect("authorized");

        assert!(auth.can_write_document);
    }

    #[test]
    fn rejects_plain_non_e2ee_rooms_in_rust_relay_v1() {
        let config = RelayConfig::default();

        let error = config
            .validate_upgrade(&UpgradeTarget {
                room_id: "layo:team:doc".to_string(),
                token: None,
                user_id: None,
                member_token: None,
                access: AccessMode::Sync,
                encrypted: false,
            })
            .expect_err("plain rooms are unsupported");

        assert_eq!(error, AuthError::EncryptedRoomsOnly);
    }

    #[test]
    fn viewer_members_are_awareness_only() {
        let config = RelayConfig::from_env_vars([(
            "COLLAB_MEMBER_TOKENS".to_string(),
            r#"[{"userId":"viewer-1","token":"viewer-secret","role":"viewer"}]"#.to_string(),
        )])
        .expect("config parses");

        let auth = config
            .validate_upgrade(&UpgradeTarget {
                room_id: "layo:team:doc".to_string(),
                token: None,
                user_id: Some("viewer-1".to_string()),
                member_token: Some("viewer-secret".to_string()),
                access: AccessMode::Awareness,
                encrypted: true,
            })
            .expect("viewer can connect");

        assert!(!auth.can_write_document);
    }

    #[test]
    fn rejects_member_token_entries_without_token_material() {
        let error = RelayConfig::from_env_vars([(
            "COLLAB_MEMBER_TOKENS".to_string(),
            r#"[{"userId":"viewer-1","role":"viewer"}]"#.to_string(),
        )])
        .expect_err("token or tokenHash is required");

        assert!(matches!(error, ConfigError::InvalidMemberTokens(_)));
    }
}
