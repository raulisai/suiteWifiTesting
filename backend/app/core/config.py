from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_env: str = "development"
    secret_key: str = "change-me-in-production-use-at-least-32-random-chars"
    access_token_expire_minutes: int = 1440

    database_url: str = "sqlite+aiosqlite:///./wifi_suite.db"

    default_interface: str = "wlan0"
    work_dir: str = "/tmp/wifi_suite_captures"
    wordlist_path: str = "/usr/share/wordlists/rockyou.txt"
    wordlists_dir: str = "/usr/share/wordlists"

    max_concurrent_attacks: int = 5
    scan_timeout: int = 60
    wps_timeout: int = 300
    handshake_timeout: int = 300

    model_config = {"env_file": ".env"}


settings = Settings()
