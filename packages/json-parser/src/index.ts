export default function parseJSON(json: string): any {
  console.log("parseJSON with unicode translated", json);
  const tokenIterator = createTokenIterator(json);
  const value = parseTokens(tokenIterator);
  if (!tokenIterator.next().done) {
    throw new Error(`Unexpected tokens after end of value`);
  }
  if (!value || (typeof value !== "object" && !Array.isArray(value))) {
    throw new Error(`Expected overall object or array but got: "${value}"`);
  }
  return value;
}

const SpecialTokenSymbol = Symbol("SpecialToken");

type Token =
  | {
      type: typeof SpecialTokenSymbol;
      value: SpecialToken;
    }
  | string
  | number
  | boolean
  | null;

type SpecialToken = "{" | "}" | "[" | "]" | ":" | ",";
type TokenIterator = Generator<Token, void, unknown>;
type TokenItem = IteratorResult<Token, void>;

// todo have these as strings and use `#contains`? is that faster?
const SPECIAL_CHARACTER_TOKENS = new Set(["{", "}", "[", "]", ":", ","]);
const IRRELEVANT_TOKENS = new Set([" ", "\n", "\t"]); // ignore white space

// NOTE: using a generator so we can lazy parse the string and if there is an issue we can stop early
function* createTokenIterator(json: string): TokenIterator {
  let i = 0;
  let token: Token;
  while (i < json.length) {
    // handle white space
    if (IRRELEVANT_TOKENS.has(json[i])) {
      // console.log(i, "createTokenIterator skipping:", json[i]);
      i++;
      continue;
    }

    // handle special characters
    if (SPECIAL_CHARACTER_TOKENS.has(json[i])) {
      token = {
        type: SpecialTokenSymbol,
        value: json[i] as SpecialToken,
      };
      console.log(i, "createTokenIterator yielding:", token);
      yield token;
      i++;
      continue;
    }

    // handle strings in quotes
    if (json[i] === '"') {
      token = "";

      // parse string
      while (json[++i] !== '"') {
        // handle new lines
        if (json[i] === "\n") {
          throw new Error(`Unexpected new line in string`);
        }

        // handle tabs
        if (json[i] === "\t") {
          throw new Error(`Unexpected tab in string`);
        }

        // handle escape characters
        if (json[i] === "\\") {
          i++; // current char is the escape character, so we skip it

          if ("x0 \n".includes(json[i])) {
            throw new Error(`Illegal escape character: ${json[i]}`);
          }

          // handle unicode escape characters
          if (json[i] === "u") {
            let unicode = "";
            for (let j = 0; j < 4; j++) {
              unicode += json[++i];
            }
            console.log(
              i,
              "createTokenIterator adding unicode:",
              unicode,
              ", to string token:",
              token,
            );
            token += String.fromCharCode(parseInt(unicode, 16));
            continue;

            // handle special escape characters
          } else if ("bfnrt".includes(json[i])) {
            if (json[i] === "b") {
              token += "\b";
            } else if (json[i] === "f") {
              token += "\f";
            } else if (json[i] === "n") {
              token += "\n";
            } else if (json[i] === "r") {
              token += "\r";
            } else if (json[i] === "t") {
              token += "\t";
            }
            continue;
          }
        }

        // handle normal characters
        token += json[i];
      }
      if (json[i] !== '"') {
        // e.g. if we hit the end of the string without a closing quote
        throw new Error(`Unexpected end of string`);
      }

      console.log(i, "createTokenIterator yielding:", token);
      yield token;
      // the current char is the closing quote, so we skip it
      i++;
      continue;
    }

    // handle numbers
    if (isNumericCharacter(json[i]) || json[i] === "-") {
      if (json[i] === "0" && "0123456789".includes(json[i + 1])) {
        throw new Error(`Unexpected leading zero in number`);
      }
      token = json[i];
      while (isNumericCharacter(json[++i])) {
        token += json[i];
      }
      token = Number(token);
      if (isNaN(token)) {
        throw new Error(`Malformed number: ${token}`);
      }
      console.log(i, "createTokenIterator yielding:", token);
      yield token;
      continue;
    }

    // handle key words
    if (isAlphabeticalCharacter(json[i])) {
      let token = json[i];
      while (isAlphabeticalCharacter(json[++i])) {
        token += json[i];
      }
      if (token === "true") {
        console.log(i, "createTokenIterator yielding:", true);
        yield true;
        continue;
      }
      if (token === "false") {
        console.log(i, "createTokenIterator yielding:", false);
        yield false;
        continue;
      }
      if (token === "null") {
        console.log(i, "createTokenIterator yielding:", null);
        yield null;
        continue;
      }
      throw new Error(`Unexpected key word: ${token}`);
    }

    throw new Error(`Unexpected character: ${json[i]}`);
  }
}

function isAlphabeticalCharacter(char: string): boolean {
  return char.toLowerCase() !== char.toUpperCase();
}

const NUMBER_TOKENS = new Set("0123456789.eE-+".split(""));
/**
 * Predicate for characters that can be in a valid number
 *
 * @example
 * 1234567890 // positive integer
 * -9876.543210 // negative floating point
 * 0.123456789e-12 // scientific notation
 * 1.234567890E+34 // scientific notation
 */
function isNumericCharacter(char: string): boolean {
  return NUMBER_TOKENS.has(char);
}

/**
 * Parses tokens into a JSON value
 */
function parseTokens(tokenIterator: TokenIterator, currentTokenItem?: TokenItem): any {
  const tokenItem = currentTokenItem || tokenIterator.next();
  if (tokenItem.done) {
    throw new Error(`Unexpected end of tokens`);
  }

  if (isSpecialTokenWithValue(tokenItem.value, "{")) {
    return parseObjectBody(tokenIterator);
  }
  if (isSpecialTokenWithValue(tokenItem.value, "[")) {
    return parseArrayBody(tokenIterator);
  }
  if (isSpecialToken(tokenItem.value)) {
    throw new Error(`Unexpected special token: ${tokenItem.value.value}`);
  }

  return tokenItem.value;
}

/**
 * Parses the tokens for an object body, starting after the opening "{"
 */
function parseObjectBody(tokenIterator: TokenIterator): Record<string, Token> {
  const properties: Record<string, Token> = {};
  // get expected key
  let keyTokenItem = tokenIterator.next();
  while (!isSpecialTokenWithValue(keyTokenItem.value, "}")) {
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
    if (!isSpecialTokenWithValue(colonTokenItem.value, ":")) {
      throw new Error(`Expected ":" but got: "${JSON.stringify(colonTokenItem.value)}"`);
    }

    // add to properties
    properties[keyTokenItem.value] = parseTokens(tokenIterator);

    // get expected comma or closing brace
    const commaTokenItem = tokenIterator.next();
    if (commaTokenItem.done) {
      throw new Error(`Unexpected end of object tokens`);
    }
    if (isSpecialTokenWithValue(commaTokenItem.value, "}")) {
      break; // end of object
    }
    if (isSpecialTokenWithValue(commaTokenItem.value, ",")) {
      // get next property key token
      keyTokenItem = tokenIterator.next();
      if (isSpecialTokenWithValue(keyTokenItem.value, "}")) {
        throw new Error(`Unexpected trailing comma in object`);
      }
      continue;
    }
    throw new Error(`Expected "," or "}" but got: "${JSON.stringify(commaTokenItem.value)}"`);
  }
  return properties;
}

/**
 * Parses the tokens for an array body, starting after the opening "["
 */
function parseArrayBody(tokenIterator: TokenIterator): Token[] {
  const values: Token[] = [];
  let tokenItem = tokenIterator.next();
  while (!isSpecialTokenWithValue(tokenItem.value, "]")) {
    if (tokenItem.done) {
      throw new Error(`Unexpected end of array tokens`);
    }
    const value = parseTokens(tokenIterator, tokenItem);
    values.push(value);
    tokenItem = tokenIterator.next();
    if (tokenItem.done) {
      throw new Error(`Unexpected end of array tokens`);
    }
    if (isSpecialTokenWithValue(tokenItem.value, "]")) {
      break; // end of array
    }
    if (isSpecialTokenWithValue(tokenItem.value, ",")) {
      tokenItem = tokenIterator.next(); // get next value
      if (isSpecialTokenWithValue(tokenItem.value, "]")) {
        throw new Error(`Unexpected trailing comma in array`);
      }
      continue;
    }
    throw new Error(`Expected "," or "]" but got: "${JSON.stringify(tokenItem.value)}"`);
  }
  return values;
}

function isSpecialTokenWithValue<Value extends SpecialToken>(
  token: Token | void,
  test: Value,
): token is { type: typeof SpecialTokenSymbol; value: Value } {
  return isSpecialToken(token) && token?.value === test;
}

function isSpecialToken(
  token: Token | void,
): token is { type: typeof SpecialTokenSymbol; value: SpecialToken } {
  return typeof token === "object" && token?.type === SpecialTokenSymbol;
}
