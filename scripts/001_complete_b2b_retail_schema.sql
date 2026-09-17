-- =============================================================================
-- GOLDEN SBM & SAKER: ENTERPRISE RELATIONAL SCHEMA & ACTIVE DATABASE ENGINE
-- Adheres strictly to University Curricula:
--   - BDD1 / BDA: Relational Theory, C.J. Date Normalization, ECA Triggers, Composite FKs
--   - Génie Logiciel (GL): 3-Tier Clean Architecture, Role Object Pattern (RBAC), Multi-Tenancy
-- Target DBMS: PostgreSQL 15+ / Supabase
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================================================
-- 1. DOMAINS & ENUMS (Domain Integrity & Data Encapsulation)
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE document_type_t AS ENUM (
    'DEVIS',
    'PROFORMA',
    'BON_COMMANDE',
    'BON_LIVRAISON',
    'FACTURE',
    'AVOIR',
    'BON_RETOUR'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE document_status_t AS ENUM (
    'BROUILLON',
    'VALIDE',
    'EN_PREPARATION',
    'EXPEDIE',
    'LIVRE',
    'ANNULE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE pricing_tier_t AS ENUM (
    'DETAIL',
    'DEMI_GROS',
    'GROS',
    'SUPER_GROS'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method_t AS ENUM (
    'ESPECES',
    'CHEQUE',
    'VIREMENT',
    'VERSEMENT_CCP',
    'LIVRAISON_CASH'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status_t AS ENUM (
    'EN_ATTENTE',
    'PAYE',
    'PARTIEL',
    'REMBOURSE',
    'REJETE'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE carrier_t AS ENUM (
    'INTERNE',
    'YALIDINE',
    'MAYSTRO',
    'ZR_EXPRESS',
    'CLIENT_ENLEVEMENT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Monetary Domain: Fixed-point arithmetic with non-negative check
DO $$ BEGIN
  CREATE DOMAIN domain_money AS NUMERIC(14, 2)
    CHECK (VALUE >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Quantity Domain: Precision for broken cartons/decimal items
DO $$ BEGIN
  CREATE DOMAIN domain_quantity AS NUMERIC(12, 3)
    CHECK (VALUE > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Phone Domain: E.164 and Algerian mobile/landline strings
DO $$ BEGIN
  CREATE DOMAIN domain_phone AS VARCHAR(30)
    CHECK (VALUE ~ '^[0-9+ ]{8,30}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- =============================================================================
-- 2. MULTI-TENANT ENTITY & USER SECURITY (Role Object Pattern / RBAC)
-- =============================================================================

-- Tenancy Relvar: Golden SBM (Wholesale) & Saker (Retail)
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  legal_name VARCHAR(255) NOT NULL,
  trade_name VARCHAR(255),
  rc_number VARCHAR(100),
  nif VARCHAR(100),
  nis VARCHAR(100),
  art_number VARCHAR(100),
  phone domain_phone,
  email VARCHAR(255),
  address TEXT,
  wilaya_code INT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Profiles: Decoupled from credentials (Credentials encapsulated in Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY, -- Maps to auth.users.id
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(255) NOT NULL,
  phone domain_phone,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Canonical Roles (Role Object Pattern instead of rigid class inheritance)
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Dynamic User Role Entitlements
CREATE TABLE IF NOT EXISTS user_roles (
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (profile_id, role_id)
);

-- Customers / Tiers (B2B wholesale clients & retail accounts)
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  code VARCHAR(50) NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  phone domain_phone NOT NULL,
  phone_secondary domain_phone,
  wilaya_code INT NOT NULL CHECK (wilaya_code BETWEEN 1 AND 58),
  daira VARCHAR(100),
  commune VARCHAR(100),
  address TEXT,
  pricing_tier pricing_tier_t NOT NULL DEFAULT 'GROS',
  credit_limit domain_money NOT NULL DEFAULT 0.00,
  current_balance domain_money NOT NULL DEFAULT 0.00,
  commercial_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_company_customer_code UNIQUE (company_id, code)
);


-- =============================================================================
-- 3. PRODUCT CATALOG (1NF Normalized Scalar Relvars & Composite Motifs)
-- =============================================================================

CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  parent_id UUID REFERENCES product_categories(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name_fr VARCHAR(100) NOT NULL,
  name_ar VARCHAR(100),
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_company_category_code UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  sku VARCHAR(100) NOT NULL,
  barcode VARCHAR(100),
  name_fr VARCHAR(255) NOT NULL,
  name_ar VARCHAR(255),
  description TEXT,
  unit VARCHAR(30) NOT NULL DEFAULT 'PIECE',
  pieces_per_carton INT NOT NULL DEFAULT 1 CHECK (pieces_per_carton >= 1),
  wholesale_price domain_money NOT NULL,
  super_gros_price domain_money,
  retail_price domain_money,
  tva_rate NUMERIC(5, 2) NOT NULL DEFAULT 19.00 CHECK (tva_rate >= 0),
  min_order_qty INT NOT NULL DEFAULT 1 CHECK (min_order_qty >= 1),
  stock_alert_level INT NOT NULL DEFAULT 5 CHECK (stock_alert_level >= 0),
  default_warehouse_zone VARCHAR(50),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_company_sku UNIQUE (company_id, sku)
);

-- Composite Relvar: Variants / Motifs belonging to a product
CREATE TABLE IF NOT EXISTS product_motifs (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  motif_code VARCHAR(50) NOT NULL,
  motif_name VARCHAR(100) NOT NULL,
  stock_qty INT NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (product_id, motif_code)
);

-- 1NF Normalization: Tags decomposed into independent scalar relation
CREATE TABLE IF NOT EXISTS product_tags (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tag VARCHAR(50) NOT NULL,
  PRIMARY KEY (product_id, tag)
);

-- 1NF Normalization: Media assets decomposed into independent scalar relation
CREATE TABLE IF NOT EXISTS product_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_type VARCHAR(20) NOT NULL DEFAULT 'IMAGE',
  url TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =============================================================================
-- 4. B2B COMMERCIAL DOCUMENTS & ACTIVE FINANCIAL CONSISTENCY
-- =============================================================================

CREATE TABLE IF NOT EXISTS b2b_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  document_number VARCHAR(50) NOT NULL,
  doc_type document_type_t NOT NULL,
  status document_status_t NOT NULL DEFAULT 'BROUILLON',
  total_ht domain_money NOT NULL DEFAULT 0.00,
  total_tva domain_money NOT NULL DEFAULT 0.00,
  total_ttc domain_money NOT NULL DEFAULT 0.00,
  discount_amount domain_money NOT NULL DEFAULT 0.00,
  carrier carrier_t NOT NULL DEFAULT 'INTERNE',
  tracking_number VARCHAR(100),
  delivery_address TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_company_doc_number UNIQUE (company_id, document_number),
  -- Financial Consistency Invariant: Total_TTC = Total_HT + Total_TVA - Remise
  CONSTRAINT chk_doc_ttc_balance CHECK (
    total_ttc = ROUND(total_ht + total_tva - discount_amount, 2)
  )
);

CREATE TABLE IF NOT EXISTS b2b_document_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES b2b_documents(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  motif_code VARCHAR(50),
  line_number INT NOT NULL CHECK (line_number >= 1),
  unit_price domain_money NOT NULL,
  quantity domain_quantity NOT NULL,
  tva_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (tva_rate >= 0),
  line_total_ht domain_money NOT NULL,
  line_total_tva domain_money NOT NULL,
  line_total_ttc domain_money NOT NULL,
  notes TEXT,

  -- Independent Product Integrity
  CONSTRAINT fk_dline_product FOREIGN KEY (product_id)
    REFERENCES products(id) ON DELETE RESTRICT,

  -- Composite Foreign Key: Enforces motif belongs exclusively to product.
  -- Under PostgreSQL MATCH SIMPLE, motif_code = NULL allows non-variant products.
  CONSTRAINT fk_dline_motif FOREIGN KEY (product_id, motif_code)
    REFERENCES product_motifs(product_id, motif_code)
    ON UPDATE CASCADE ON DELETE RESTRICT,

  -- Deterministic Mathematical Consistency at Line Level
  CONSTRAINT chk_line_calc CHECK (
    line_total_ht = ROUND(unit_price * quantity, 2)
    AND line_total_tva = ROUND(line_total_ht * (tva_rate / 100.0), 2)
    AND line_total_ttc = ROUND(line_total_ht + line_total_tva, 2)
  ),
  CONSTRAINT uq_document_line_number UNIQUE (document_id, line_number)
);

CREATE TABLE IF NOT EXISTS customer_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  document_id UUID REFERENCES b2b_documents(id) ON DELETE SET NULL,
  payment_number VARCHAR(50) NOT NULL,
  amount domain_money NOT NULL,
  payment_method payment_method_t NOT NULL,
  payment_status payment_status_t NOT NULL DEFAULT 'PAYE',
  reference_number VARCHAR(100),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  recorded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_company_payment_number UNIQUE (company_id, payment_number)
);


-- =============================================================================
-- 5. ACTIVE DATABASE (ECA) ENGINE: HIGH-CONCURRENCY STATEMENT RECALCULATION
-- Resolves PostgreSQL Syntax Bug: Split into INSERT, UPDATE, and DELETE triggers
-- =============================================================================

-- Recalculation function for INSERT transition tables
CREATE OR REPLACE FUNCTION fn_recalculate_document_totals_ins()
RETURNS TRIGGER AS $$
BEGIN
  WITH affected_docs AS (
    SELECT DISTINCT document_id FROM new_table
  ),
  aggregated_totals AS (
    SELECT
      l.document_id,
      COALESCE(SUM(l.line_total_ht), 0.00) AS sum_ht,
      COALESCE(SUM(l.line_total_tva), 0.00) AS sum_tva
    FROM b2b_document_lines l
    WHERE l.document_id IN (SELECT document_id FROM affected_docs)
    GROUP BY l.document_id
  )
  UPDATE b2b_documents d
  SET
    total_ht = a.sum_ht,
    total_tva = a.sum_tva,
    total_ttc = ROUND(a.sum_ht + a.sum_tva - d.discount_amount, 2),
    updated_at = CURRENT_TIMESTAMP
  FROM aggregated_totals a
  WHERE d.id = a.document_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Recalculation function for UPDATE transition tables
CREATE OR REPLACE FUNCTION fn_recalculate_document_totals_upd()
RETURNS TRIGGER AS $$
BEGIN
  WITH affected_docs AS (
    SELECT document_id FROM new_table
    UNION
    SELECT document_id FROM old_table
  ),
  aggregated_totals AS (
    SELECT
      l.document_id,
      COALESCE(SUM(l.line_total_ht), 0.00) AS sum_ht,
      COALESCE(SUM(l.line_total_tva), 0.00) AS sum_tva
    FROM b2b_document_lines l
    WHERE l.document_id IN (SELECT document_id FROM affected_docs)
    GROUP BY l.document_id
  )
  UPDATE b2b_documents d
  SET
    total_ht = COALESCE(a.sum_ht, 0.00),
    total_tva = COALESCE(a.sum_tva, 0.00),
    total_ttc = ROUND(COALESCE(a.sum_ht, 0.00) + COALESCE(a.sum_tva, 0.00) - d.discount_amount, 2),
    updated_at = CURRENT_TIMESTAMP
  FROM affected_docs aff
  LEFT JOIN aggregated_totals a ON aff.document_id = a.document_id
  WHERE d.id = aff.document_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Recalculation function for DELETE transition tables
CREATE OR REPLACE FUNCTION fn_recalculate_document_totals_del()
RETURNS TRIGGER AS $$
BEGIN
  WITH affected_docs AS (
    SELECT DISTINCT document_id FROM old_table
  ),
  aggregated_totals AS (
    SELECT
      l.document_id,
      COALESCE(SUM(l.line_total_ht), 0.00) AS sum_ht,
      COALESCE(SUM(l.line_total_tva), 0.00) AS sum_tva
    FROM b2b_document_lines l
    WHERE l.document_id IN (SELECT document_id FROM affected_docs)
    GROUP BY l.document_id
  )
  UPDATE b2b_documents d
  SET
    total_ht = COALESCE(a.sum_ht, 0.00),
    total_tva = COALESCE(a.sum_tva, 0.00),
    total_ttc = ROUND(COALESCE(a.sum_ht, 0.00) + COALESCE(a.sum_tva, 0.00) - d.discount_amount, 2),
    updated_at = CURRENT_TIMESTAMP
  FROM affected_docs aff
  LEFT JOIN aggregated_totals a ON aff.document_id = a.document_id
  WHERE d.id = aff.document_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 1. Trigger for Statement-Level INSERT
DROP TRIGGER IF EXISTS trg_doc_lines_recalc_ins ON b2b_document_lines;
CREATE TRIGGER trg_doc_lines_recalc_ins
AFTER INSERT ON b2b_document_lines
REFERENCING NEW TABLE AS new_table
FOR EACH STATEMENT
EXECUTE FUNCTION fn_recalculate_document_totals_ins();

-- 2. Trigger for Statement-Level UPDATE
DROP TRIGGER IF EXISTS trg_doc_lines_recalc_upd ON b2b_document_lines;
CREATE TRIGGER trg_doc_lines_recalc_upd
AFTER UPDATE ON b2b_document_lines
REFERENCING NEW TABLE AS new_table OLD TABLE AS old_table
FOR EACH STATEMENT
EXECUTE FUNCTION fn_recalculate_document_totals_upd();

-- 3. Trigger for Statement-Level DELETE
DROP TRIGGER IF EXISTS trg_doc_lines_recalc_del ON b2b_document_lines;
CREATE TRIGGER trg_doc_lines_recalc_del
AFTER DELETE ON b2b_document_lines
REFERENCING OLD TABLE AS old_table
FOR EACH STATEMENT
EXECUTE FUNCTION fn_recalculate_document_totals_del();


-- =============================================================================
-- 6. INDEXING & QUERY OPTIMIZATION
-- =============================================================================

-- Trigram GIN Search Indexes for Arabic & French Product Lookup
CREATE INDEX IF NOT EXISTS idx_products_name_fr_trgm ON products USING gin (name_fr gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_sku_trgm ON products USING gin (sku gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm ON customers USING gin (company_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- Foreign Key B-Tree Indexes (Eliminating sequential table scans on joins)
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_doc_lines_document ON b2b_document_lines(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_lines_product ON b2b_document_lines(product_id);
CREATE INDEX IF NOT EXISTS idx_b2b_docs_customer ON b2b_documents(customer_id);
CREATE INDEX IF NOT EXISTS idx_b2b_docs_company_status ON b2b_documents(company_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON customer_payments(customer_id);


-- =============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_motifs ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE b2b_document_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;

-- Multi-Tenant Company Isolation Policy
CREATE POLICY p_company_tenant_isolation ON customers
  FOR ALL
  USING (company_id = (NULLIF(current_setting('app.current_company_id', true), '')::UUID));

CREATE POLICY p_products_tenant_isolation ON products
  FOR ALL
  USING (company_id = (NULLIF(current_setting('app.current_company_id', true), '')::UUID));

CREATE POLICY p_docs_tenant_isolation ON b2b_documents
  FOR ALL
  USING (company_id = (NULLIF(current_setting('app.current_company_id', true), '')::UUID));


-- =============================================================================
-- 8. INITIAL SEED DATA (Tenants & Canonical Roles)
-- =============================================================================

INSERT INTO companies (code, legal_name, trade_name)
VALUES
  ('GOLDEN_SBM', 'SARL Golden SBM Import & Distribution', 'Golden SBM'),
  ('SAKER', 'Établissement Saker Outillage & Quincaillerie', 'Saker Retail')
ON CONFLICT (code) DO NOTHING;

INSERT INTO roles (code, name, description)
VALUES
  ('ADMIN', 'Administrateur', 'Accès complet au système et à la configuration'),
  ('COMMERCIAL', 'Commercial B2B', 'Gestion des clients, devis, proformas et commandes'),
  ('MAGASINIER', 'Magasinier / Pointeur', 'Préparation des commandes, scan et pointage physique'),
  ('CHAUFFEUR', 'Chauffeur / Livreur', 'Transport des colis et accusés de livraison'),
  ('COMPTABLE', 'Comptabilité', 'Encaissements, facturation et créances clients')
ON CONFLICT (code) DO NOTHING;
