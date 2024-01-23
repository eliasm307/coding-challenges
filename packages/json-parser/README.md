# JSON Parser

See https://codingchallenges.fyi/challenges/challenge-json-parser/

## Implementation

The implementation starts out by creating a stream of tokens from the input using a generator function. I used a generator function here because it allows the parser to only process tokens as it needs them, rather than having to read the entire input into memory at once. This is especially important for large inputs and also has the added benefit of allowing the parser to stop early if it encounters invalid syntax.

The stream of tokens is then parsed and validated to build up the JSON data structure in memory.

## Testing

The parser implementation was tested with official test cases from http://www.json.org/JSON_checker/ and also with a few custom test cases.
