const fs = require('fs');
fetch('http://localhost:3000/items')
  .then(res => res.json())
  .then(data => {
    let items = data.data || data;
    console.log(items.slice(0, 2));
  });
