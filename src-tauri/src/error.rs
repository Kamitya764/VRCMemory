use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Parse error: {0}")]
    Parse(String),

    #[error("Image error: {0}")]
    Image(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Lock error: {0}")]
    Lock(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Sidecar error: {0}")]
    Sidecar(String),

    #[error("Setup error: {0}")]
    Setup(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeMap;
        let mut map = serializer.serialize_map(Some(2))?;
        let kind = match self {
            AppError::Database(_) => "database",
            AppError::Io(_) => "io",
            AppError::Parse(_) => "parse",
            AppError::Image(_) => "image",
            AppError::Validation(_) => "validation",
            AppError::Lock(_) => "lock",
            AppError::NotFound(_) => "not_found",
            AppError::Sidecar(_) => "sidecar",
            AppError::Setup(_) => "setup",
        };
        map.serialize_entry("kind", kind)?;
        map.serialize_entry("message", &self.to_string())?;
        map.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;
