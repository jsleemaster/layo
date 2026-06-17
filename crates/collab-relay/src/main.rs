use collab_relay::{config::RelayConfig, server};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = RelayConfig::from_current_env()?;
    server::run(config).await?;
    Ok(())
}
