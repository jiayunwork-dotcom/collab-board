CREATE TABLE plugin_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canvas_id UUID NOT NULL REFERENCES canvases(id) ON DELETE CASCADE,
    plugin_name VARCHAR(100) NOT NULL,
    config_key VARCHAR(100) NOT NULL,
    config_value TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(canvas_id, plugin_name, config_key)
);

CREATE INDEX idx_plugin_configs_canvas ON plugin_configs(canvas_id);
CREATE INDEX idx_plugin_configs_canvas_plugin ON plugin_configs(canvas_id, plugin_name);
