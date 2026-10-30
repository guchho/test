export const helpText = `Usage: guchho-test [command] [files...] [options]

Commands:
  run                  Run tests once (default)

Options:
  --filter <text>      Only run tests whose full name contains text
  -h, --help           Show this help message
  -v, --version        Show the installed version

Exit codes:
  0                    All selected tests passed
  1                    One or more tests failed
  2                    Configuration or execution error
`;
