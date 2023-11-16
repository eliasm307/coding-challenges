export default function parseJSON(text: string): any {
  const tokenIterator = createTokenIterator(text);
  const value = parseTokens({ context: { depthIndex: 0, tokenIterator } });
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

// We use a symbol to identify special tokens so we can differentiate them from parsed values
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

type ParserContext = {
  /**
   * Where the top level is 0, and each nested object or array increments the depth
   */
  depthIndex: number;
  tokenIterator: TokenIterator;
};

const SPECIAL_CHARACTER_TOKENS = "{}[]:,";
const WHITE_SPACE_TOKENS = " \n\t";

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
      token = {
        type: SpecialTokenSymbol,
        value: text[charIndex] as SpecialToken,
      };
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

          // NOTE: not sure why these are illegal, but they are in the standard tests
          if ("x0 \n".includes(text[charIndex])) {
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
    if (isNumericCharacter(text[charIndex]) || text[charIndex] === "-") {
      if (text[charIndex] === "0" && "0123456789".includes(text[charIndex + 1])) {
        throw new Error(`Unexpected leading zero in number`);
      }
      token = text[charIndex];
      while (isNumericCharacter(text[++charIndex])) {
        token += text[charIndex];
      }
      token = Number(token);
      if (isNaN(token)) {
        throw new Error(`Malformed number: ${token}`);
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

const NUMBER_VALUE_TOKENS = "0123456789.eE-+";
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
  return NUMBER_VALUE_TOKENS.includes(char);
}

/**
 * Parses tokens into a JSON value
 */
function parseTokens({
  context,
  currentTokenItem,
}: {
  context: ParserContext;
  currentTokenItem?: TokenItem;
}): any {
  const tokenItem = currentTokenItem || context.tokenIterator.next();
  if (tokenItem.done) {
    throw new Error(`Unexpected end of tokens`);
  }

  if (isSpecialTokenWithValue(tokenItem.value, "{")) {
    return parseObjectBody({ ...context, depthIndex: context.depthIndex + 1 });
  }
  if (isSpecialTokenWithValue(tokenItem.value, "[")) {
    return parseArrayBody({ ...context, depthIndex: context.depthIndex + 1 });
  }
  if (isSpecialToken(tokenItem.value)) {
    throw new Error(`Unexpected special token: ${tokenItem.value.value}`);
  }

  return tokenItem.value;
}

/**
 * Parses the tokens for an object body, starting after the opening "{"
 */
function parseObjectBody(context: ParserContext): Record<string, Token> {
  if (context.depthIndex > MAX_DEPTH_INDEX) {
    throw new Error(`Max depth exceeded`);
  }

  const properties: Record<string, Token> = {};
  // get expected key
  let keyTokenItem = context.tokenIterator.next();
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
    const colonTokenItem = context.tokenIterator.next();
    if (colonTokenItem.done) {
      throw new Error(`Unexpected end of object tokens`);
    }
    if (!isSpecialTokenWithValue(colonTokenItem.value, ":")) {
      throw new Error(`Expected ":" but got: "${JSON.stringify(colonTokenItem.value)}"`);
    }

    // add to properties
    properties[keyTokenItem.value] = parseTokens({ context });

    // get expected comma or closing brace
    const commaTokenItem = context.tokenIterator.next();
    if (commaTokenItem.done) {
      throw new Error(`Unexpected end of object tokens`);
    }
    if (isSpecialTokenWithValue(commaTokenItem.value, "}")) {
      break; // end of object
    }
    if (isSpecialTokenWithValue(commaTokenItem.value, ",")) {
      // get next property key token
      keyTokenItem = context.tokenIterator.next();
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
function parseArrayBody(context: ParserContext): Token[] {
  if (context.depthIndex > MAX_DEPTH_INDEX) {
    throw new Error(`Max depth exceeded`);
  }

  const values: Token[] = [];
  let currentTokenItem = context.tokenIterator.next();
  while (!isSpecialTokenWithValue(currentTokenItem.value, "]")) {
    if (currentTokenItem.done) {
      throw new Error(`Unexpected end of array tokens`);
    }
    values.push(parseTokens({ context, currentTokenItem: currentTokenItem }));

    // check next token
    currentTokenItem = context.tokenIterator.next();
    if (currentTokenItem.done) {
      throw new Error(`Unexpected end of array tokens`);
    }
    if (isSpecialTokenWithValue(currentTokenItem.value, "]")) {
      break; // end of array
    }
    if (isSpecialTokenWithValue(currentTokenItem.value, ",")) {
      currentTokenItem = context.tokenIterator.next(); // get next value
      if (isSpecialTokenWithValue(currentTokenItem.value, "]")) {
        throw new Error(`Unexpected trailing comma in array`);
      }
      continue;
    }
    throw new Error(`Expected "," or "]" but got: "${JSON.stringify(currentTokenItem.value)}"`);
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
