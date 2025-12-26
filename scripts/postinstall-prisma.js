// Post-install script to create default.js for Prisma client
// Only creates the file if it doesn't exist - doesn't overwrite existing implementation
const fs = require('fs');
const path = require('path');

const defaultJsPath = path.join(__dirname, '..', '.prisma', 'client', 'default.js');

// Only create if it doesn't exist - don't overwrite existing custom implementation
if (!fs.existsSync(defaultJsPath)) {
  // Create .prisma/client directory if it doesn't exist
  const clientDir = path.dirname(defaultJsPath);
  if (!fs.existsSync(clientDir)) {
    fs.mkdirSync(clientDir, { recursive: true });
  }

  // Use the full implementation (same as .prisma/client/default.js)
  const defaultJsContent = `// Prisma Client default export
// This file bridges @prisma/client to the generated TypeScript client
// We extract the config from the generated files and create PrismaClient

const runtime = require('@prisma/client/runtime/client');
const fs = require('fs');
const path = require('path');

let PrismaClient;

try {
  // Read the generated class.ts to extract the config
  const classTsPath = path.join(__dirname, 'internal', 'class.ts');
  
  if (!fs.existsSync(classTsPath)) {
    throw new Error('Generated class.ts not found. Run: npx prisma generate');
  }
  
  const classTsContent = fs.readFileSync(classTsPath, 'utf8');
  
  // Extract runtimeDataModel JSON
  const runtimeDataModelMatch = classTsContent.match(/config\\.runtimeDataModel\\s*=\\s*JSON\\.parse\\("(.*?)"\\)/s);
  if (!runtimeDataModelMatch) {
    throw new Error('Could not extract runtimeDataModel');
  }
  
  // Parse the JSON (handle escaped characters)
  const runtimeDataModelJson = runtimeDataModelMatch[1]
    .replace(/\\\\"/g, '"')
    .replace(/\\\\n/g, '')
    .replace(/\\\\\\\\/g, '\\\\');
  
  const runtimeDataModel = JSON.parse(runtimeDataModelJson);
  
  // Extract other config values with defaults
  const previewFeaturesMatch = classTsContent.match(/"previewFeatures":\\s*\\[(.*?)\\]/);
  const previewFeatures = previewFeaturesMatch 
    ? previewFeaturesMatch[1].split(',').map(s => s.trim().replace(/["']/g, '')).filter(s => s)
    : [];
  
  const clientVersion = (classTsContent.match(/"clientVersion":\\s*"(.*?)"/) || [])[1] || '7.2.0';
  const activeProvider = (classTsContent.match(/"activeProvider":\\s*"(.*?)"/) || [])[1] || 'postgresql';
  const inlineSchemaMatch = classTsContent.match(/"inlineSchema":\\s*"(.*?)",/s);
  const inlineSchema = inlineSchemaMatch 
    ? inlineSchemaMatch[1].replace(/\\\\n/g, '\\n').replace(/\\\\"/g, '"').replace(/\\\\\\\\/g, '\\\\')
    : '';
  
  const engineVersion = (classTsContent.match(/"engineVersion":\\s*"(.*?)"/) || [])[1] || '';
  
  // Build config object
  const config = {
    runtimeDataModel,
    previewFeatures,
    clientVersion,
    activeProvider,
    inlineSchema,
    engineVersion,
    compilerWasm: {
      getRuntime: async () => await import("@prisma/client/runtime/query_compiler_bg.postgresql.mjs"),
    },
  };
  
  // Get PrismaClient class from runtime
  PrismaClient = runtime.getPrismaClient(config);
  
} catch (e) {
  console.error('Error in .prisma/client/default.js:', e.message);
  PrismaClient = class {
    constructor(options = {}) {
      throw new Error(
        \`PrismaClient initialization failed: \${e.message}. \` +
        'Please ensure: 1) Database is running, 2) DATABASE_URL is set in .env.local, ' +
        '3) Run: npx prisma generate && npx prisma db push'
      );
    }
  };
}

module.exports = { PrismaClient };
`;

  // Write default.js only if it doesn't exist
  fs.writeFileSync(defaultJsPath, defaultJsContent);
  console.log('✓ Created .prisma/client/default.js');
} else {
  console.log('✓ .prisma/client/default.js already exists, skipping');
}
