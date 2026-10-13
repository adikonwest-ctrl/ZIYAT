const { createServer } = require('node:http');
const { handleRequest } = require('./server.js');

const server = createServer(handleRequest);

server.listen(process.env.PORT || 3000);
