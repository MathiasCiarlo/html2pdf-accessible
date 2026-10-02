import { CSSValue } from "../syntax/parser";
import { TokenType } from "../syntax/tokenizer";

/** Evaluate the numeric subset of relative color calc(), never source code. */
export function evaluateColorCalculation(
  values: CSSValue[],
  components: readonly number[],
  depth = 0
): number {
  const invalid = (): never => {
    throw new Error("Invalid relative color calculation");
  };
  if (depth > 64 || values.length > 1024) invalid();
  const tokens = values.filter(
    (token) => token.type !== TokenType.WHITESPACE_TOKEN
  );
  let index = 0;
  const operator = (): string | undefined => {
    const token = tokens[index];
    return token?.type === TokenType.DELIM_TOKEN ? token.value : undefined;
  };
  const finite = (value: number): number => {
    if (!Number.isFinite(value)) invalid();
    return value;
  };
  const primary = (): number => {
    const sign = operator();
    if (sign === "+" || sign === "-") {
      index++;
      return finite((sign === "-" ? -1 : 1) * primary());
    }
    const token = tokens[index++];
    if (!token) return invalid();
    if (token.type === TokenType.NUMBER_TOKEN) return finite(token.number);
    if (token.type === TokenType.IDENT_TOKEN) {
      const names = ["r", "g", "b", "alpha", "x", "y", "z"];
      const position = names.indexOf(token.value);
      if (position < 0) return invalid();
      return finite(components[position > 3 ? position - 4 : position]);
    }
    if (
      (token.type === TokenType.LEFT_PARENTHESIS_TOKEN && "values" in token) ||
      (token.type === TokenType.FUNCTION && token.name === "calc")
    ) {
      return evaluateColorCalculation(token.values, components, depth + 1);
    }
    return invalid();
  };
  const product = (): number => {
    let value = primary();
    while (operator() === "*" || operator() === "/") {
      const operation = operator();
      index++;
      const right = primary();
      value = finite(operation === "*" ? value * right : value / right);
    }
    return value;
  };
  let value = product();
  while (operator() === "+" || operator() === "-") {
    const operation = operator();
    index++;
    const right = product();
    value = finite(operation === "+" ? value + right : value - right);
  }
  if (index !== tokens.length) invalid();
  return value;
}
