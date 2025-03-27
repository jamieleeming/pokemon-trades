module.exports = {
  extends: [
    "react-app", // Inherits the CRA eslint config
    "react-app/jest" // Enables jest rules
  ],
  plugins: [
    "react-hooks"
  ],
  rules: {
    "react-hooks/rules-of-hooks": "error", // Checks rules of Hooks
    "react-hooks/exhaustive-deps": "warn" // Checks effect dependencies
  }
}; 