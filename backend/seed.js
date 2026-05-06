/**
 * Seed script – populates DynamoDB tables with sample data.
 * Run once: node seed.js
 *
 * Requires DynamoDB Local to be running:
 *   docker compose up -d dynamodb-local
 */
'use strict';

require('dotenv').config();
const { initDb, TABLES } = require('./db');
const { v4: uuidv4 } = require('uuid');

const questsData = [
  { title: 'Salary Anchor',                           category: 'casa',                 status: 'Live',      start_date: '2026-05-01', end_date: '2026-05-20', segment: 'Salary Customers',    target: 42000, completion: 58, xp: 1500, revenue: 420000, budget: 52000, action: 'Move salary account to the bank.' },
  { title: 'Save 2k in Al Hayrat for Two Months',     category: 'casa',                 status: 'Live',      start_date: '2026-05-01', end_date: '2026-07-01', segment: 'Salary Customers',    target: 42000, completion: 58, xp: 1500, revenue: 420000, budget: 52000, action: 'Save more than 2k in al hayrat account and get points.' },
  { title: 'Navigate in the App',                     category: 'spending',             status: 'Scheduled', start_date: '2026-05-12', end_date: '2026-05-29', segment: 'Mass Retail',         target: 36000, completion: 66, xp: 800,  revenue: 260000, budget: 41000, action: 'Navigate through the app and complete the guided tutorial.' },
  { title: 'Plan Your Vacation with Gulf Air',        category: 'spending',             status: 'Scheduled', start_date: '2026-05-18', end_date: '2026-05-31', segment: 'Mass Retail',         target: 28000, completion: 54, xp: 500,  revenue: 85000,  budget: 14000, action: 'Book tickets with Gulf Air using a BBK card/account.' },
  { title: 'Get Your Daily Coffee From Starbucks',    category: 'spending',             status: 'Scheduled', start_date: '2026-05-18', end_date: '2026-05-31', segment: 'Mass Retail',         target: 28000, completion: 54, xp: 500,  revenue: 85000,  budget: 14000, action: 'Buy a coffee from Starbucks for a whole month using your BBK card.' },
  { title: 'Buy a Ticket For Al Dana Concerts',       category: 'spending',             status: 'Scheduled', start_date: '2026-05-18', end_date: '2026-05-31', segment: 'Mass Retail',         target: 28000, completion: 54, xp: 500,  revenue: 85000,  budget: 14000, action: 'Buy a ticket for Al Dana Concerts using your BBK card.' },
  { title: 'Buy From Lulu Hypermarket',               category: 'spending',             status: 'Scheduled', start_date: '2026-05-18', end_date: '2026-05-31', segment: 'Mass Retail',         target: 28000, completion: 54, xp: 500,  revenue: 85000,  budget: 14000, action: 'Do your shopping at Lulu hypermarket using your BBK card.' },
  { title: 'Get a Financing',                         category: 'casa',                 status: 'Scheduled', start_date: '2026-05-08', end_date: '2026-05-25', segment: 'Mass Retail',         target: 30000, completion: 62, xp: 700,  revenue: 180000, budget: 26000, action: 'Get any type of Financing – personal, mortgage, auto or advance salary.' },
  { title: 'Bill Pay Streak',                         category: 'engagement',           status: 'Live',      start_date: '2026-05-03', end_date: '2026-05-18', segment: 'Mass Retail',         target: 55000, completion: 71, xp: 450,  revenue: 95000,  budget: 18000, action: 'Pay two utility bills through the mobile banking bill payment service.' },
  { title: 'Phishing Fighter',                        category: 'risk',                 status: 'Live',      start_date: '2026-05-04', end_date: '2026-05-14', segment: 'Mass Retail',         target: 75000, completion: 49, xp: 350,  revenue: 0,      budget: 12000, action: 'Report any phishing attempts on your account.' },
  { title: 'Pay Credit Card Bills on Time',           category: 'risk',                 status: 'Live',      start_date: '2026-05-04', end_date: '2026-05-14', segment: 'Mass Retail',         target: 75000, completion: 49, xp: 350,  revenue: 0,      budget: 12000, action: 'Pay credit card bills on time.' },
  { title: 'Donate to Charity',                       category: 'socialresponsibility', status: 'Live',      start_date: '2026-05-12', end_date: '2026-05-26', segment: 'Mass Retail',         target: 22000, completion: 74, xp: 650,  revenue: 60000,  budget: 9000,  action: 'Donate to a verified Charity initiative.' },
  { title: 'Green Financing',                         category: 'socialresponsibility', status: 'Draft',     start_date: '2026-06-02', end_date: '2026-06-19', segment: 'Youth & Students',    target: 18000, completion: 48, xp: 900,  revenue: 45000,  budget: 15000, action: 'Get Financing for a green project (Solar system) or initiative.' }
];

const customersData = [
  { name: 'Mariam Al Omar',   segment: 'Salary Customers',    quests_done: 18, xp: 12850, completion: 98, impact: 18400, tier: 'Diamond'  },
  { name: 'Omar Haddad',      segment: 'Affluent',            quests_done: 17, xp: 11920, completion: 96, impact: 17100, tier: 'Diamond'  },
  { name: 'Layla Mansour',    segment: 'Credit Card Holders', quests_done: 16, xp: 11240, completion: 94, impact: 15250, tier: 'Platinum' },
  { name: 'Yousef Karim',     segment: 'Mass Retail',         quests_done: 15, xp: 10780, completion: 92, impact: 13900, tier: 'Platinum' },
  { name: 'Noura Saleh',      segment: 'Youth & Students',    quests_done: 15, xp: 10220, completion: 90, impact: 12150, tier: 'Gold'     },
  { name: 'Fahad Al Nasser',  segment: 'Affluent',            quests_done: 14, xp: 9875,  completion: 89, impact: 11800, tier: 'Gold'     },
  { name: 'Sara Qureshi',     segment: 'Mass Retail',         quests_done: 13, xp: 9250,  completion: 86, impact: 10400, tier: 'Gold'     },
  { name: 'Khalid Rahman',    segment: 'Dormant Customers',   quests_done: 12, xp: 8810,  completion: 84, impact: 9600,  tier: 'Silver'   },
  { name: 'Aisha Khan',       segment: 'Credit Card Holders', quests_done: 12, xp: 8425,  completion: 82, impact: 8950,  tier: 'Silver'   },
  { name: 'Hassan Diab',      segment: 'Salary Customers',    quests_done: 11, xp: 7980,  completion: 80, impact: 8200,  tier: 'Silver'   }
];

const rewardsData = [
  { name: 'AED 25 Cashback',              description: 'Instant cashback credited to your account',               type: 'Cashback',         value: 25,   xp_cost: 300,  stock: -1,  status: 'Active' },
  { name: 'AED 100 Cashback',             description: 'Premium cashback reward for top performers',               type: 'Cashback',         value: 100,  xp_cost: 1000, stock: -1,  status: 'Active' },
  { name: 'Fee-Free Transfers (1 Month)', description: 'Zero fee on all transfers for 30 days',                    type: 'Free Transaction', value: 0,    xp_cost: 600,  stock: 500, status: 'Active' },
  { name: '500 Airline Miles',            description: 'Redeemable with partner airlines',                         type: 'Travel Miles',     value: 500,  xp_cost: 750,  stock: 200, status: 'Active' },
  { name: 'Amazon Gift Voucher AED 100',  description: 'Spend anywhere on Amazon.ae',                              type: 'Gift Voucher',     value: 100,  xp_cost: 1200, stock: 100, status: 'Active' },
  { name: '0.5% Rate Reduction',          description: '0.5% reduction on loan rate for 3 months',                 type: 'Rate Discount',    value: 0.5,  xp_cost: 2000, stock: 50,  status: 'Active' },
  { name: 'Monthly Prize Draw Entry',     description: 'Entry into the monthly AED 10,000 prize draw',             type: 'Prize Draw',       value: 0,    xp_cost: 250,  stock: -1,  status: 'Active' },
  { name: 'Airport Lounge Access',        description: 'Single access to partner airport lounges',                 type: 'Gift Voucher',     value: 0,    xp_cost: 1500, stock: 150, status: 'Active' }
];

const badgesData = [
  { name: 'Quest Starter',   description: 'Completed your very first quest',                   icon: 'fa-star',                 criteria: 'Complete 1 quest',                          xp_bonus: 50,  rule: { field: 'quests_done', op: 'gte', value: 1    } },
  { name: 'Quest Streak ×5', description: 'Completed 5 quests back-to-back',                  icon: 'fa-fire',                 criteria: 'Complete 5 quests',                         xp_bonus: 150, rule: { field: 'quests_done', op: 'gte', value: 5    } },
  { name: 'CASA Champion',   description: 'Completed 3 CASA improvement quests',              icon: 'fa-piggy-bank',           criteria: 'Complete 10 quests total',                  xp_bonus: 200, rule: { field: 'quests_done', op: 'gte', value: 10   } },
  { name: 'Big Saver',       description: 'Maintained a high balance for 3 months',           icon: 'fa-vault',                criteria: 'Reach Gold tier or above',                  xp_bonus: 250, rule: { field: 'tier',        op: 'in',  value: ['Gold', 'Platinum', 'Diamond'] } },
  { name: 'Digital Native',  description: 'Completed all digital-channel engagement quests',  icon: 'fa-mobile-screen-button', criteria: 'Reach 85% average completion',               xp_bonus: 100, rule: { field: 'completion',  op: 'gte', value: 85   } },
  { name: 'Green Hero',      description: 'Champion of social responsibility',                 icon: 'fa-leaf',                 criteria: 'Reach Platinum tier or above',               xp_bonus: 150, rule: { field: 'tier',        op: 'in',  value: ['Platinum', 'Diamond'] } },
  { name: 'Risk Guardian',   description: 'Completed all risk reduction quests',              icon: 'fa-shield-halved',        criteria: 'Complete 12 quests total',                  xp_bonus: 175, rule: { field: 'quests_done', op: 'gte', value: 12   } },
  { name: 'Diamond Elite',   description: 'Reached the highest loyalty tier',                 icon: 'fa-gem',                  criteria: 'Accumulate 10,000+ XP',                     xp_bonus: 500, rule: { field: 'xp',          op: 'gte', value: 10000 } }
];

/**
 * Evaluate a single badge rule against a customer record.
 * Supported ops: gte (>=), lte (<=), eq (===), in (array includes)
 */
function evaluateRule(rule, customer) {
  const actual = customer[rule.field];
  if (actual === undefined || actual === null) return false;
  switch (rule.op) {
    case 'gte': return actual >= rule.value;
    case 'lte': return actual <= rule.value;
    case 'eq':  return actual === rule.value;
    case 'in':  return Array.isArray(rule.value) && rule.value.includes(actual);
    default:    return false;
  }
}

async function clearTable(db, table, keyFn) {
  const items = await db.scan(table);
  await Promise.all(items.map(item => db.delete(table, keyFn(item))));
  console.log(`  Cleared ${items.length} items from ${table}`);
}

async function main() {
  const db = await initDb();
  const now = new Date().toISOString();

  console.log('\nClearing tables…');
  await clearTable(db, TABLES.CUSTOMER_BADGES, i => ({ customer_id: i.customer_id, badge_id: i.badge_id }));
  await clearTable(db, TABLES.BADGES,          i => ({ id: i.id }));
  await clearTable(db, TABLES.REWARDS,         i => ({ id: i.id }));
  await clearTable(db, TABLES.CUSTOMERS,       i => ({ id: i.id }));
  await clearTable(db, TABLES.QUESTS,          i => ({ id: i.id }));

  console.log('\nSeeding quests…');
  for (const q of questsData) {
    await db.put(TABLES.QUESTS, {
      id: uuidv4(), ...q, created_at: now, updated_at: now
    });
  }
  console.log(`  ${questsData.length} quests inserted.`);

  console.log('\nSeeding customers…');
  const insertedCustomers = [];
  for (const c of customersData) {
    const item = { id: uuidv4(), ...c };
    await db.put(TABLES.CUSTOMERS, item);
    insertedCustomers.push(item);
  }
  console.log(`  ${customersData.length} customers inserted.`);

  console.log('\nSeeding rewards…');
  for (const r of rewardsData) {
    await db.put(TABLES.REWARDS, { id: uuidv4(), ...r, created_at: now });
  }
  console.log(`  ${rewardsData.length} rewards inserted.`);

  console.log('\nSeeding badges…');
  const badgeIds = [];
  for (const b of badgesData) {
    const id = uuidv4();
    badgeIds.push(id);
    await db.put(TABLES.BADGES, { id, ...b, created_at: now });
  }
  console.log(`  ${badgesData.length} badges inserted.`);

  console.log('\nEvaluating achievements for all customers…');
  const allBadges    = await db.scan(TABLES.BADGES);
  const allCustomers = await db.scan(TABLES.CUSTOMERS);
  let assignments    = 0;
  for (const customer of allCustomers) {
    for (const badge of allBadges) {
      if (!badge.rule) continue;
      if (evaluateRule(badge.rule, customer)) {
        await db.put(TABLES.CUSTOMER_BADGES, { customer_id: customer.id, badge_id: badge.id });
        assignments++;
      }
    }
  }
  console.log(`  ${assignments} badge assignments awarded.`);

  console.log('\nSeed completed successfully.');
  process.exit(0);
}

main().catch(err => { console.error('Seed failed:', err); process.exit(1); });
