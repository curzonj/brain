# brain

This is my personal knowledge base system. In this repository are both a
react web front end and a commandline client.

It is an unhosted application that stores it's data in a hosted couchdb
that the react single page app and the CLI tool replicate to and from.

The deployed static files are currently available via github pages at
https://curzonj.github.io/brain-v2-test

This will be updated to https://curzonj.github.io/brain once I've finished
testing this version

There are no instructions yet for how to get the tool setup, I'm just making
the code public for the sake of sharing my work.

## Development Commands

Command                | Description                                      |
-----------------------|--------------------------------------------------|
`$ npm start`          | Start the development server
`$ npm test`           | Lint, validate deps & run tests
`$ npm run build`      | Compile all files into `build/`
`$ npm run deploy`     | Copy all files in `dist/` to gh-pages and push
