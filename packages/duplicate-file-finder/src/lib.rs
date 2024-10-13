use std::{
    fs,
    path::{Path, PathBuf},
};

/// Error when creating runner from args
#[derive(Debug, PartialEq)]
pub enum FromArgsError {
    InsufficientArguments,
    TooManyArguments,
    InvalidFilePath,
    NotADirectory,
}

#[derive(Debug, PartialEq)]
pub struct Runner {
    /// Path is relative to the root of the project
    root_dir: PathBuf,
}

impl Runner {
    /// NOTE: first arg is path to binary (always included)
    /// second arg should be path to root directory to check
    pub fn from_args(args: Vec<String>) -> Result<Runner, FromArgsError> {
        // check args count
        let args_len = args.len();
        if args_len < 2 {
            return Err(FromArgsError::InsufficientArguments);
        }
        if args_len > 2 {
            return Err(FromArgsError::TooManyArguments);
        }

        let root_dir = Path::new(&args[1]).to_owned();

        // ensure path is to dir that exists
        match root_dir.metadata() {
            Err(_) => Err(FromArgsError::InvalidFilePath),
            Ok(r) => {
                if r.is_dir() {
                    return Ok(Runner { root_dir });
                }
                Err(FromArgsError::NotADirectory)
            }
        }
    }
}
