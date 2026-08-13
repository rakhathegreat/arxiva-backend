const http = require('http');

http.get('http://127.0.0.1:3000/items', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const items = JSON.parse(data);
    if(items.length > 0) {
      console.log(JSON.stringify(items[0], null, 2));
    }
  });
}).on('error', err => console.log(err.message));
