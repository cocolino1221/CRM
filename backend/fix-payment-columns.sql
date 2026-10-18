-- Add payment method and firm enums and columns to deals table
-- This script manually applies the payment method migration

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
