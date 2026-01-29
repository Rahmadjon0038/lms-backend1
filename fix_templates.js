const fs = require('fs');

let content = fs.readFileSync('controllers/paymentController.js', 'utf8');

// Replace all remaining ${role === 'teacher' ? 2 : 1} with $${role === 'teacher' ? 2 : 1}
// Using a more careful approach
let originalMatches = content.match(/\${role === 'teacher' \? 2 : 1}/g);
console.log('Found matches:', originalMatches ? originalMatches.length : 0);

content = content.replace(/\${role === 'teacher' \? 2 : 1}/g, '$${role === \'teacher\' ? 2 : 1}');

let newMatches = content.match(/\${role === 'teacher' \? 2 : 1}/g);
console.log('Remaining matches:', newMatches ? newMatches.length : 0);

fs.writeFileSync('controllers/paymentController.js', content);
console.log('Fixed all template literals');