CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255),
    avatar_url VARCHAR(500),
    color VARCHAR(20) DEFAULT '#4F46E5',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE canvases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL DEFAULT 'Untitled',
    description TEXT,
    thumbnail_url VARCHAR(500),
    is_public BOOLEAN DEFAULT FALSE,
    background_type VARCHAR(20) DEFAULT 'GRID_DOTS',
    background_color VARCHAR(20) DEFAULT '#FFFFFF',
    grid_size INTEGER DEFAULT 20,
    viewport_x DOUBLE PRECISION DEFAULT 0,
    viewport_y DOUBLE PRECISION DEFAULT 0,
    viewport_zoom DOUBLE PRECISION DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE canvas_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    invite_email VARCHAR(255),
    invite_token VARCHAR(255) UNIQUE,
    invite_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(canvas_id, user_id),
    UNIQUE(canvas_id, invite_email)
);

CREATE TABLE canvas_elements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES canvas_elements(id) ON DELETE SET NULL,
    type VARCHAR(30) NOT NULL,
    x DOUBLE PRECISION DEFAULT 0,
    y DOUBLE PRECISION DEFAULT 0,
    width DOUBLE PRECISION DEFAULT 100,
    height DOUBLE PRECISION DEFAULT 100,
    rotation DOUBLE PRECISION DEFAULT 0,
    z_index INTEGER DEFAULT 0,
    opacity DOUBLE PRECISION DEFAULT 1,
    locked BOOLEAN DEFAULT FALSE,
    visible BOOLEAN DEFAULT TRUE,
    group_id UUID,
    data JSONB NOT NULL DEFAULT '{}',
    version_vector JSONB NOT NULL DEFAULT '{}',
    last_modified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_modified_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_canvas_elements_canvas ON canvas_elements(canvas_id);
CREATE INDEX idx_canvas_elements_parent ON canvas_elements(parent_id);
CREATE INDEX idx_canvas_elements_group ON canvas_elements(group_id);
CREATE INDEX idx_canvas_elements_zindex ON canvas_elements(canvas_id, z_index);

CREATE TABLE canvas_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    from_element_id UUID NOT NULL REFERENCES canvas_elements(id) ON DELETE CASCADE,
    to_element_id UUID NOT NULL REFERENCES canvas_elements(id) ON DELETE CASCADE,
    from_point VARCHAR(20) DEFAULT 'auto',
    to_point VARCHAR(20) DEFAULT 'auto',
    style VARCHAR(20) DEFAULT 'curve',
    arrow_style VARCHAR(20) DEFAULT 'end',
    color VARCHAR(20) DEFAULT '#374151',
    thickness DOUBLE PRECISION DEFAULT 2,
    label VARCHAR(500),
    waypoints JSONB DEFAULT '[]',
    z_index INTEGER DEFAULT 0,
    version_vector JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_connections_canvas ON canvas_connections(canvas_id);
CREATE INDEX idx_connections_from ON canvas_connections(from_element_id);
CREATE INDEX idx_connections_to ON canvas_connections(to_element_id);

CREATE TABLE canvas_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    branch_name VARCHAR(100) DEFAULT 'main',
    parent_version_id UUID REFERENCES canvas_versions(id),
    created_by UUID REFERENCES users(id),
    summary VARCHAR(500),
    snapshot JSONB NOT NULL,
    operations JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_versions_canvas ON canvas_versions(canvas_id);
CREATE INDEX idx_versions_branch ON canvas_versions(canvas_id, branch_name, version_number);

CREATE TABLE templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) DEFAULT 'custom',
    thumbnail_url VARCHAR(500),
    is_builtin BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE operation_logs (
    id BIGSERIAL PRIMARY KEY,
    canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    operation_type VARCHAR(50) NOT NULL,
    operation_data JSONB NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ops_canvas_time ON operation_logs(canvas_id, timestamp);
