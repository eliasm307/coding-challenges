export default function parseJSON(text: string): any {
  const tokenIterator = createTokenIterator(text);
  const value = parseTokens(tokenIterator, 0);
  if (!tokenIterator.next().done) {
    throw new Error(`Unexpected tokens after end of value`);
  }
  if (!value || (typeof value !== "object" && !Array.isArray(value))) {
    throw new Error(`Expected top level object or array but got: "${value}"`);
  }
  return value;
}

/**
 * The depth is arbitrary, but we need to set a limit to pass the standard tests
 *
 * @see https://stackoverflow.com/questions/42116718/is-there-an-array-depth-limitation-in-json
 */
const MAX_DEPTH_INDEX = 19; // 0 based index

type Token = string | number | boolean | null;

type TokenIterator = Generator<Token, void, unknown>;
type TokenItem = IteratorResult<Token, void>;

const SPECIAL_CHARACTER_TOKENS = "{}[]:,";
const WHITE_SPACE_TOKENS = " \n\t";
// NOTE: not sure why these are illegal, but they are in the standard tests
const ILLEGAL_ESCAPE_CHARS = "x0 \n";
const NUMBERS = "0123456789";

/**
 * Characters that can be in a valid number value
 *
 * @example
 * 1234567890 // positive integer
 * -9876.543210 // negative floating point
 * 0.123456789e-12 // scientific notation
 * 1.234567890E+34 // scientific notation
 */
const NUMBER_VALUE_TOKENS = NUMBERS + ".eE-+";

// NOTE: using a generator so we can lazy parse the string and if there is an issue we can stop early
function* createTokenIterator(text: string): TokenIterator {
  let charIndex = 0;
  let token: Token;
  while (charIndex < text.length) {
    if (WHITE_SPACE_TOKENS.includes(text[charIndex])) {
      charIndex++; // ignore white space
      continue;
    }

    // handle special characters
    if (SPECIAL_CHARACTER_TOKENS.includes(text[charIndex])) {
      token = text[charIndex];
      yield token;
      charIndex++; // the current char is the special character, so we get the next char for the next iteration
      continue;
    }

    // handle strings in quotes
    if (text[charIndex] === '"') {
      token = "";
      // parse string until we hit the closing quote
      while (text[++charIndex] !== '"') {
        // handle new lines
        if (text[charIndex] === "\n") {
          throw new Error(`Unexpected new line in string`);
        }

        // handle tabs
        if (text[charIndex] === "\t") {
          throw new Error(`Unexpected tab in string`);
        }

        // handle escape characters
        if (text[charIndex] === "\\") {
          charIndex++; // current char is the escape character, so we skip it

          if (ILLEGAL_ESCAPE_CHARS.includes(text[charIndex])) {
            throw new Error(`Illegal escape character: ${text[charIndex]}`);
          }

          // handle unicode escape characters
          if (text[charIndex] === "u") {
            let unicode = "";
            for (let j = 0; j < 4; j++) {
              unicode += text[++charIndex];
            }
            token += String.fromCharCode(parseInt(unicode, 16));
            continue;
          }

          // handle special escape characters
          switch (text[charIndex]) {
            case "b":
              token += "\b";
              continue;
            case "f":
              token += "\f";
              continue;
            case "n":
              token += "\n";
              continue;
            case "r":
              token += "\r";
              continue;
            case "t":
              token += "\t";
              continue;
          }
        }

        // handle normal characters
        token += text[charIndex];
      }
      if (text[charIndex] !== '"') {
        // e.g. if we hit the end of the string without a closing quote
        throw new Error(`Unexpected end of string`);
      }

      yield token;
      charIndex++; // the current char is the closing quote, so we get the next char for the next iteration
      continue;
    }

    // handle numbers
    if (NUMBER_VALUE_TOKENS.includes(text[charIndex]) || text[charIndex] === "-") {
      if (text[charIndex] === "0" && NUMBERS.includes(text[charIndex + 1])) {
        throw new Error(`Unexpected leading zero in number`);
      }
      token = text[charIndex];
      while (NUMBER_VALUE_TOKENS.includes(text[++charIndex])) {
        token += text[charIndex];
      }
      token = Number(token);
      if (isNaN(token)) {
        throw new Error(`Malformed number`);
      }
      yield token;
      // current char is the first non numeric character, so we keep it for the next iteration
      continue;
    }

    // handle key words
    if (isAlphabeticalCharacter(text[charIndex])) {
      let token = text[charIndex];
      while (isAlphabeticalCharacter(text[++charIndex])) {
        token += text[charIndex];
      }
      // current char is the first non alphabetical character, so we keep it for the next iteration
      if (token === "true") {
        yield true;
        continue;
      }
      if (token === "false") {
        yield false;
        continue;
      }
      if (token === "null") {
        yield null;
        continue;
      }
      throw new Error(`Unexpected key word: ${token}`);
    }

    throw new Error(`Unexpected character: ${text[charIndex]}`);
  }
}

function isAlphabeticalCharacter(char: string): boolean {
  // only alphabetical characters have a different upper and lower case
  return char.toLowerCase() !== char.toUpperCase();
}

/**
 * Parses tokens into a JSON value
 */
function parseTokens(
  tokenIterator: TokenIterator,
  depthIndex: number,
  currentTokenItem?: TokenItem,
): any {
  const tokenItem = currentTokenItem || tokenIterator.next();
  if (tokenItem.done) {
    throw new Error(`Unexpected end of tokens`);
  }

  if (tokenItem.value === "{") {
    return parseObjectBody(tokenIterator, depthIndex + 1);
  }
  if (tokenItem.value === "[") {
    return parseArrayBody(tokenIterator, depthIndex + 1);
  }
  if (SPECIAL_CHARACTER_TOKENS.includes(tokenItem.value as string)) {
    throw new Error(`Unexpected special token: ${tokenItem.value}`);
  }

  return tokenItem.value;
}

/**
 * Parses the tokens for an object body, starting after the opening "{"
 */
function parseObjectBody(tokenIterator: TokenIterator, depthIndex: number): Record<string, Token> {
  if (depthIndex > MAX_DEPTH_INDEX) {
    throw new Error(`Max depth exceeded`);
  }

  const object: Record<string, Token> = {};

  // get expected key
  let keyTokenItem = tokenIterator.next();
  while (keyTokenItem.value !== "}") {
    if (keyTokenItem.done) {
      throw new Error(`Unexpected end of object tokens`);
    }
    if (typeof keyTokenItem.value !== "string") {
      throw new Error(
        `Expected string for object key but got: "${JSON.stringify(keyTokenItem.value)}"`,
      );
    }

    // get expected colon
    const colonTokenItem = tokenIterator.next();
    if (colonTokenItem.done) {
      throw new Error(`Unexpected end of object tokens`);
    }
    if (colonTokenItem.value !== ":") {
      throw new Error(`Expected ":" but got: "${JSON.stringify(colonTokenItem.value)}"`);
    }

    // add to properties
    object[keyTokenItem.value] = parseTokens(tokenIterator, depthIndex);

    // get expected comma or closing brace
    const commaTokenItem = tokenIterator.next();
    if (commaTokenItem.done) {
      throw new Error(`Unexpected end of object tokens`);
    }
    if (commaTokenItem.value === "}") {
      break; // end of object
    }
    if (commaTokenItem.value === ",") {
      // get next property key token
      keyTokenItem = tokenIterator.next();
      if (keyTokenItem.value === "}") {
        throw new Error(`Unexpected trailing comma in object`);
      }
      continue;
    }
    throw new Error(`Expected "," or "}" but got: "${JSON.stringify(commaTokenItem.value)}"`);
  }

  return object;
}

/**
 * Parses the tokens for an array body, starting after the opening "["
 */
function parseArrayBody(tokenIterator: TokenIterator, depthIndex: number): Token[] {
  if (depthIndex > MAX_DEPTH_INDEX) {
    throw new Error(`Max depth exceeded`);
  }

  const values: Token[] = [];
  let currentTokenItem = tokenIterator.next();
  while (currentTokenItem.value !== "]") {
    if (currentTokenItem.done) {
      throw new Error(`Unexpected end of array tokens`);
    }
    values.push(parseTokens(tokenIterator, depthIndex, currentTokenItem));

    // check next token
    currentTokenItem = tokenIterator.next();
    if (currentTokenItem.done) {
      throw new Error(`Unexpected end of array tokens`);
    }
    if (currentTokenItem.value === "]") {
      break; // end of array
    }
    if (currentTokenItem.value === ",") {
      currentTokenItem = tokenIterator.next(); // get next value
      if (currentTokenItem.value === "]") {
        throw new Error(`Unexpected trailing comma in array`);
      }
      continue;
    }
    throw new Error(`Expected "," or "]" but got: "${JSON.stringify(currentTokenItem.value)}"`);
  }
  return values;
}
