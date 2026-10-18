const { Client } = require('pg');
require('dotenv').config();

const sql = `
-- Add payment method and firm enums and columns to deals table

-- Create payment method enum if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deals_paymentmethod_enum') THEN
        CREATE TYPE "public"."deals_paymentmethod_enum" AS ENUM('integral', 'rate', 'bill');
    END IF;
END $$;

-- Create firm enum if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deals_firm_enum') THEN
        CREATE TYPE "public"."deals_firm_enum" AS ENUM('old', 'new', 'dubai');
    END IF;
END $$;

-- Add paymentMethod column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'deals' AND column_name = 'paymentMethod'
    ) THEN
        ALTER TABLE "deals" ADD "paymentMethod" "public"."deals_paymentmethod_enum";
        COMMENT ON COLUMN "deals"."paymentMethod" IS 'Payment method when deal is closed won';
    END IF;
END $$;

-- Add firm column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'deals' AND column_name = 'firm'
    ) THEN
        ALTER TABLE "deals" ADD "firm" "public"."deals_firm_enum";
        COMMENT ON COLUMN "deals"."firm" IS 'Firm selected for rate or bill payment methods';
    END IF;
END $$;
`;

async function applyFix() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected successfully');

    console.log('Applying payment method columns fix...');
    await client.query(sql);
    console.log('✅ Payment method columns added successfully!');

    // Verify columns were added
    const result = await client.query(`
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_name = 'deals' AND column_name IN ('paymentMethod', 'firm')
      ORDER BY column_name;
    `);

    console.log('\nVerification - Columns in deals table:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.udt_name}`);
    });

  } catch (error) {
    console.error('❌ Error applying fix:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyFix();
