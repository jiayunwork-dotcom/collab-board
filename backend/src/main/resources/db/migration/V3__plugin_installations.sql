CREATE TABLE plugin_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    plugin_name VARCHAR(100) NOT NULL,
    plugin_version VARCHAR(50) NOT NULL,
    permissions JSONB NOT NULL DEFAULT '[]',
    enabled BOOLEAN DEFAULT TRUE,
    installed_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    installed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(canvas_id, plugin_name)
);

CREATE INDEX idx_plugin_installations_canvas ON plugin_installations(canvas_id);
CREATE INDEX idx_plugin_installations_user ON plugin_installations(installed_by);
