### Development

`pnpm install` from project root
`pnpm turbo dev --filter=@lingo.dev/compile` to compile and watch for compiler changes

Choose the demo you want to work with and run it from the corresponding folder.
`tsdown` in compiler is configured to cleanup the output folder before compilation, which works fine with next, but vite
seems to be dead every time and has to be restarted.
