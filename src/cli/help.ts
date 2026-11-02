export const helpText = `Usage: guchho-test [command] [files...] [options]

Commands:
  run                  Run tests once (default)
  watch                Run tests and rerun affected files on change

Options:
  --watch              Alias for the watch command
  --run                Run tests once (default)
  --filter <text>      Only run tests whose full name contains text
  --testNamePattern <pattern>
                       Only run tests whose full name matches the pattern
  --config <path>      Use an explicit configuration file
  --timeout <ms>       Override the per-test timeout in milliseconds
  --reporter <name>    Select a reporter: default, verbose, dot, json, junit,
                       tap, github, github-actions
  --update, -u         Update snapshots that changed or are missing
  --coverage           Collect V8 coverage for the current run
  --changed[=<ref>]    Run tests affected by uncommitted changes or changes since ref
  --related <path>     Run tests affected by a file (repeatable)
  --listTests          Print selected test files without running them
  --passWithNoTests    Exit successfully when no test files are selected
  --silent             Suppress console output from test files
  --bail               Stop after the first failure
  --maxWorkers <count> Run test files in parallel using up to count workers
  --pool <name>        Select the execution pool: threads, forks
  --shard <index>/<count>
                       Run only the given shard of selected test files
  -h, --help           Show this help message
  -v, --version        Show the installed version

Exit codes:
  0                    All selected tests passed
  1                    One or more tests failed
  2                    Configuration or execution error
`;
