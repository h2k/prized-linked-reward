/**
 * Database layer – Amazon DynamoDB via AWS SDK v3.
 * Call initDb() once at startup; then use getDynamo() anywhere.
 *
 * For local development, set DYNAMODB_ENDPOINT=http://localhost:8000 in .env
 * and run:  docker compose up -d dynamodb-local
 */
'use strict';

const {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand
} = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  ScanCommand,
  DeleteCommand,
  QueryCommand
} = require('@aws-sdk/lib-dynamodb');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// ── Table names ───────────────────────────────────────────────────────────────
const P = process.env.DYNAMO_TABLE_PREFIX || 'gaq_';
const TABLES = {
  USERS:           `${P}users`,
  QUESTS:          `${P}quests`,
  CUSTOMERS:       `${P}customers`,
  AUDIT_LOG:       `${P}audit_log`,
  REWARDS:         `${P}rewards`,
  TIER_CONFIG:     `${P}tier_config`,
  BADGES:          `${P}badges`,
  CUSTOMER_BADGES: `${P}customer_badges`
};

// ── DynamoDB table definitions ────────────────────────────────────────────────
const TABLE_DEFS = [
  { TableName: TABLES.USERS,       KeySchema: [{ AttributeName: 'id',          KeyType: 'HASH'  }], AttributeDefinitions: [{ AttributeName: 'id',          AttributeType: 'S' }] },
  { TableName: TABLES.QUESTS,      KeySchema: [{ AttributeName: 'id',          KeyType: 'HASH'  }], AttributeDefinitions: [{ AttributeName: 'id',          AttributeType: 'S' }] },
  { TableName: TABLES.CUSTOMERS,   KeySchema: [{ AttributeName: 'id',          KeyType: 'HASH'  }], AttributeDefinitions: [{ AttributeName: 'id',          AttributeType: 'S' }] },
  { TableName: TABLES.AUDIT_LOG,   KeySchema: [{ AttributeName: 'id',          KeyType: 'HASH'  }], AttributeDefinitions: [{ AttributeName: 'id',          AttributeType: 'S' }] },
  { TableName: TABLES.REWARDS,     KeySchema: [{ AttributeName: 'id',          KeyType: 'HASH'  }], AttributeDefinitions: [{ AttributeName: 'id',          AttributeType: 'S' }] },
  { TableName: TABLES.TIER_CONFIG, KeySchema: [{ AttributeName: 'tier',        KeyType: 'HASH'  }], AttributeDefinitions: [{ AttributeName: 'tier',        AttributeType: 'S' }] },
  { TableName: TABLES.BADGES,      KeySchema: [{ AttributeName: 'id',          KeyType: 'HASH'  }], AttributeDefinitions: [{ AttributeName: 'id',          AttributeType: 'S' }] },
  {
    TableName: TABLES.CUSTOMER_BADGES,
    KeySchema: [
      { AttributeName: 'customer_id', KeyType: 'HASH'  },
      { AttributeName: 'badge_id',    KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'customer_id', AttributeType: 'S' },
      { AttributeName: 'badge_id',    AttributeType: 'S' }
    ]
  }
].map(def => ({ ...def, BillingMode: 'PAY_PER_REQUEST' }));

// ── Client singleton ──────────────────────────────────────────────────────────
let _docClient = null;

// ── Low-level full-scan (handles DynamoDB 1 MB page limit) ───────────────────
async function _fullScan(tableName) {
  const items = [];
  let lastKey;
  do {
    const params = { TableName: tableName };
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const res = await _docClient.send(new ScanCommand(params));
    items.push(...(res.Items ?? []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

// ── Thin helper object (returned by getDynamo / initDb) ───────────────────────
const db = {
  /** Insert or fully replace an item. */
  put: (table, item) =>
    _docClient.send(new PutCommand({ TableName: table, Item: item })),

  /** Return the item for a given primary-key object, or null. */
  get: (table, key) =>
    _docClient.send(new GetCommand({ TableName: table, Key: key }))
              .then(r => r.Item ?? null),

  /** Return ALL items in a table (handles pagination). */
  scan: (table) => _fullScan(table),

  /** Delete the item at the given primary-key object. */
  delete: (table, key) =>
    _docClient.send(new DeleteCommand({ TableName: table, Key: key })),

  /** Query a table or index. Pass any QueryCommand params (merged with TableName). */
  query: (table, params) =>
    _docClient.send(new QueryCommand({ TableName: table, ...params }))
              .then(r => r.Items ?? []),

  /** Delete every item in a table, resolving primary key via keyFn(item). */
  clearTable: async (table, keyFn) => {
    const items = await _fullScan(table);
    await Promise.all(items.map(item =>
      _docClient.send(new DeleteCommand({ TableName: table, Key: keyFn(item) }))
    ));
  }
};

function getDynamo() {
  if (!_docClient) throw new Error('DynamoDB not initialised. Call initDb() first.');
  return db;
}

// ── Table provisioning ────────────────────────────────────────────────────────
async function ensureTables(client) {
  for (const def of TABLE_DEFS) {
    try {
      await client.send(new DescribeTableCommand({ TableName: def.TableName }));
    } catch (e) {
      if (e.name !== 'ResourceNotFoundException') throw e;
      await client.send(new CreateTableCommand(def));
      console.log(`  Created table: ${def.TableName}`);
    }
  }
}

// ── Idempotent bootstrap seeds ────────────────────────────────────────────────
async function _seedAdmin() {
  const users     = await _fullScan(TABLES.USERS);
  const adminExists = users.some(u => u.username === 'admin');
  if (!adminExists) {
    await db.put(TABLES.USERS, {
      id: uuidv4(),
      username:   'admin',
      password:   bcrypt.hashSync('Admin@1234', 12),
      role:       'admin',
      full_name:  'Platform Administrator',
      created_at: new Date().toISOString()
    });
    console.log('  Default admin user created (admin / Admin@1234).');
  }
}

async function _seedTiers() {
  const existing = await _fullScan(TABLES.TIER_CONFIG);
  if (existing.length) return;
  const tiers = [
    { tier: 'Silver',   xp_min: 0,     xp_max: 999,    benefits: 'Basic rewards access, monthly cashback draws',                             sort_order: 1 },
    { tier: 'Gold',     xp_min: 1000,  xp_max: 4999,   benefits: 'Priority customer service, 2x XP on spending quests',                     sort_order: 2 },
    { tier: 'Platinum', xp_min: 5000,  xp_max: 9999,   benefits: 'Lounge access, fee waivers, premium prize pool entry',                     sort_order: 3 },
    { tier: 'Diamond',  xp_min: 10000, xp_max: 999999, benefits: 'Dedicated relationship manager, exclusive prize draws, full fee waiver',   sort_order: 4 }
  ];
  await Promise.all(tiers.map(t => db.put(TABLES.TIER_CONFIG, t)));
  console.log('  Default tier config seeded.');
}

// ── Public init ───────────────────────────────────────────────────────────────
async function initDb() {
  const cfg = { region: process.env.AWS_REGION || 'us-east-1' };

  if (process.env.DYNAMODB_ENDPOINT) {
    cfg.endpoint    = process.env.DYNAMODB_ENDPOINT;
    cfg.credentials = {
      accessKeyId:     process.env.AWS_ACCESS_KEY_ID     || 'local',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'local'
    };
  }

  const client = new DynamoDBClient(cfg);
  _docClient   = DynamoDBDocumentClient.from(client, {
    marshallOptions:   { removeUndefinedValues: true },
    unmarshallOptions: { wrapNumbers: false }
  });

  console.log('DynamoDB: ensuring tables…');
  await ensureTables(client);
  await _seedAdmin();
  await _seedTiers();
  console.log('DynamoDB ready.');
  return db;
}

module.exports = { initDb, getDynamo, TABLES };
