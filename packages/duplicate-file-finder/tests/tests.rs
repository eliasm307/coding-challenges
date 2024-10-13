use duplicate_file_finder::{FromArgsError, Runner};

const BINARY_PATH: &str = "binary/path";
const TEST_FILE_PATH: &str = "tests/data/file1.txt";
const WITH_NO_DUPLICATES_DIR_PATH: &str = "tests/data/with-no-duplicates";

#[cfg(test)]
mod from_args {
    use super::*;

    #[test]
    fn error_if_path_not_provided() {
        assert_eq!(
            Runner::from_args(vec![]),
            Err(FromArgsError::InsufficientArguments)
        )
    }

    #[test]
    fn error_if_path_does_not_exist() {
        assert_eq!(
            Runner::from_args(vec![BINARY_PATH.to_owned(), String::from("unknown")]),
            Err(FromArgsError::InvalidFilePath)
        )
    }

    #[test]
    fn error_if_path_is_not_a_dir() {
        assert_eq!(
            Runner::from_args(vec![BINARY_PATH.to_owned(), TEST_FILE_PATH.to_owned()]),
            Err(FromArgsError::NotADirectory)
        )
    }

    #[test]
    fn ok_if_path_is_a_dir() {
        let result = Runner::from_args(vec![
            BINARY_PATH.to_owned(),
            WITH_NO_DUPLICATES_DIR_PATH.to_owned(),
        ]);

        assert!(result.is_ok())
    }

    #[test]
    fn error_if_extra_args_provided() {
        assert_eq!(
            Runner::from_args(vec![
                BINARY_PATH.to_owned(),
                WITH_NO_DUPLICATES_DIR_PATH.to_owned(),
                TEST_FILE_PATH.to_owned(),
            ]),
            Err(FromArgsError::TooManyArguments)
        )
    }
}
