module.exports = {
  env: {
    browser: true,
    es6: true
  },
  extends: "standard",
  globals: {
    Atomics: "readonly",
    SharedArrayBuffer: "readonly"
  },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  rules: {
    semi:  ["error", "never"],
    quotes: "off",
    "object-curly-spacing": "off",
    "space-before-function-paren": "off",
    "comma-dangle": ["error", "only-multiline"]
  }
}
