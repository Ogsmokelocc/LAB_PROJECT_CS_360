-- ============================================================
--  Palouse Properties — Database Schema
-- ============================================================


-- ------------------------------------------------------------
--  1. MAINTENANCE REQUESTS
--     Stores tenant maintenance tickets submitted via the site.
-- ------------------------------------------------------------
CREATE TABLE maintenance_form (
    id           SERIAL       PRIMARY KEY,
    ticket_id    VARCHAR(20)  UNIQUE NOT NULL,

    firstName    VARCHAR(100) NOT NULL,
    lastName     VARCHAR(100) NOT NULL,

    email        VARCHAR(150) NOT NULL,
    phone        VARCHAR(14)  NOT NULL,

    address      TEXT         NOT NULL,
    unit         VARCHAR(10),

    catagory     VARCHAR(50)  NOT NULL,   -- keeping original spelling for compatibility
    description  TEXT         NOT NULL,
    preferred_time TEXT,

    submitted_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);


-- ------------------------------------------------------------
--  2. PROPERTIES
--     Master table for all rental listings.
--     One row per physical unit/property.
-- ------------------------------------------------------------
CREATE TABLE properties (
    id          SERIAL       PRIMARY KEY,

    -- Location
    address     TEXT         NOT NULL,
    city        VARCHAR(100) NOT NULL DEFAULT 'Moscow',
    state       VARCHAR(2)   NOT NULL DEFAULT 'ID',
    zip         VARCHAR(10),

    -- Classification
    type        VARCHAR(50)  NOT NULL,   -- Apartment | House | Studio | TownHome
    beds        INTEGER      NOT NULL DEFAULT 0,  -- 0 = studio
    baths       NUMERIC(3,1),            -- supports 1.5, 2.5, etc.
    sqft        INTEGER,

    -- Financials
    price       NUMERIC(10,2) NOT NULL,  -- monthly rent in USD

    -- Availability
    available        BOOLEAN      NOT NULL DEFAULT TRUE,
    available_date   DATE,               -- when it becomes available (nullable = now)

    -- Extra info
    description      TEXT,
    pet_friendly     BOOLEAN      NOT NULL DEFAULT FALSE,
    parking          BOOLEAN      NOT NULL DEFAULT FALSE,
    laundry          VARCHAR(50),        -- e.g. 'In-unit', 'Shared', 'None'

    -- Timestamps
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);


-- ------------------------------------------------------------
--  3. PROPERTY IMAGES
--     Stores one or more photos per property.
--     The frontend uses primary_image_url as the card thumbnail
--     and photo_count to show the "📷 N" badge.
-- ------------------------------------------------------------
CREATE TABLE property_images (
    id           SERIAL       PRIMARY KEY,
    property_id  INTEGER      NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

    -- URL path to the image.
    --   • For local files use a relative path:  /property-photos/prop_1_front.jpg
    --   • For cloud storage use the full URL:   https://your-bucket.s3.amazonaws.com/…
    image_url    TEXT         NOT NULL,

    -- Human-readable label (shown in future detail modals)
    caption      VARCHAR(255),

    -- Ordering & primary flag
    is_primary   BOOLEAN      NOT NULL DEFAULT FALSE,  -- TRUE = use as card thumbnail
    sort_order   INTEGER      NOT NULL DEFAULT 0,       -- lower number shown first

    uploaded_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- Only one image per property can be the primary thumbnail
CREATE UNIQUE INDEX idx_one_primary_per_property
    ON property_images (property_id)
    WHERE is_primary = TRUE;

-- Speed up the sub-queries in GET /api/properties
CREATE INDEX idx_property_images_property_id ON property_images(property_id);
CREATE INDEX idx_properties_available        ON properties(available);
CREATE INDEX idx_properties_price            ON properties(price);
CREATE INDEX idx_properties_beds             ON properties(beds);
CREATE INDEX idx_properties_type             ON properties(type);


-- ------------------------------------------------------------
--  4. SAMPLE DATA  (remove or adjust before production)
--     Shows how to insert a property and link its photos.
-- ------------------------------------------------------------

-- Insert a sample property
INSERT INTO properties
    (address, type, beds, baths, sqft, price, available, description, pet_friendly, parking)
VALUES
    ('123 Main St, Moscow, ID 83843', 'House',     3, 2.0, 1400, 1450.00, TRUE,
     'Spacious 3-bed house near UI campus. Washer/dryer included.', TRUE, TRUE),

    ('456 Elm Ave #2, Moscow, ID 83843', 'Apartment', 1, 1.0,  620,  795.00, TRUE,
     'Cozy 1-bedroom apartment, great natural light.', FALSE, FALSE),

    ('789 Oak Dr, Moscow, ID 83843',  'TownHome',  2, 1.5,  980, 1100.00, FALSE,
     'Modern townhome, currently leased. Available June 1st.', FALSE, TRUE),

    ('321 Pine St, Moscow, ID 83843', 'Studio',    0, 1.0,  400,  650.00, TRUE,
     'Affordable studio close to downtown Moscow.', FALSE, FALSE);


-- Link photos to the first property (id=1)
-- Replace the image_url values with real paths once you have photos.
INSERT INTO property_images (property_id, image_url, caption, is_primary, sort_order)
VALUES
    (1, '/property-photos/1_front.jpg',   'Front of house',  TRUE,  0),
    (1, '/property-photos/1_kitchen.jpg', 'Kitchen',         FALSE, 1),
    (1, '/property-photos/1_backyard.jpg','Backyard',        FALSE, 2);

INSERT INTO property_images (property_id, image_url, caption, is_primary, sort_order)
VALUES
    (2, '/property-photos/2_living.jpg',  'Living room',     TRUE,  0);