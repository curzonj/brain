# brain

This is my personal knowledge base system. In this repository are both a
react web front end and a commandline client.

It is an unhosted application that stores it's data in a hosted couchdb
that the react single page app and the CLI tool replicate to and from.

The react app is deployed to github pages via github actions. It's available
at https://curzonj.github.io/brain.

There are no instructions yet for how to get the tool setup, right now I'm
just making the code public for the sake of sharing my work and making use
of free services like github actions.

## Development Commands

Command                | Description                                      |
-----------------------|--------------------------------------------------|
`$ npm start`          | Start the development server
`$ npm test`           | Lint, validate deps & run tests
`$ npm lint`           | Typescript checking and linting
`$ ./bin/devDb`        | Starts the local pouchdb for development

