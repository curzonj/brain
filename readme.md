# brain

This is the front end to my personal knowledge base system.

It is an unhosted application that stores it's data in replicated
and/or decentralized data stores that are configured client-side.

The deployed static files are available via github pages:

https://curzonj.github.io/brain

# development

to serve local files with a url you can use:

```bash
npx http-server -c-1
```

## Commands

Command                | Description                                      |
-----------------------|--------------------------------------------------|
`$ npm start`          | Start the development server
`$ npm test`           | Lint, validate deps & run tests
`$ npm run build`      | Compile all files into `dist/`
`$ npm run deploy`     | Copy all files in `dist/` to gh-pages and push
`$ npm run create`     | Generate a scaffold file
`$ npm run inspect`    | Inspect the bundle's dependencies
