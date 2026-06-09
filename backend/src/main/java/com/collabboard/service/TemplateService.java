package com.collabboard.service;

import com.collabboard.entity.Template;
import com.collabboard.repository.TemplateRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Service
public class TemplateService {

    private final TemplateRepository templateRepository;
    private final ObjectMapper objectMapper;

    public TemplateService(TemplateRepository templateRepository, ObjectMapper objectMapper) {
        this.templateRepository = templateRepository;
        this.objectMapper = objectMapper;
    }

    @PostConstruct
    @Transactional
    public void initBuiltinTemplates() {
        long count = templateRepository.count();
        if (count > 0) return;

        List<Template> builtins = new ArrayList<>();
        builtins.add(createBrainstormTemplate());
        builtins.add(createProjectPlanTemplate());
        builtins.add(createUserJourneyTemplate());
        builtins.add(createArchitectureTemplate());
        builtins.add(createSwotTemplate());
        builtins.add(createKanbanTemplate());

        templateRepository.saveAll(builtins);
    }

    public List<Template> getAllTemplates(UUID userId) {
        List<Template> result = new ArrayList<>();
        result.addAll(templateRepository.findByIsBuiltinTrue());
        if (userId != null) {
            result.addAll(templateRepository.findByCreatedBy(userId));
        }
        return result;
    }

    public List<Template> getPublicTemplates() {
        return templateRepository.findByIsBuiltinTrue();
    }

    @Transactional
    public Template createCustomTemplate(UUID userId, String name, String description,
                                         String category, Map<String, Object> data) {
        Template template = Template.builder()
                .name(name)
                .description(description)
                .category(category != null ? category : "custom")
                .isBuiltin(false)
                .createdBy(userId)
                .data(data)
                .build();
        return templateRepository.save(template);
    }

    public Template getTemplate(UUID id) {
        return templateRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Template not found"));
    }

    @Transactional
    public void deleteTemplate(UUID id, UUID userId) {
        Template t = templateRepository.findById(id).orElseThrow();
        if (Boolean.TRUE.equals(t.getIsBuiltin())) {
            throw new RuntimeException("Cannot delete builtin template");
        }
        if (!t.getCreatedBy().equals(userId)) {
            throw new RuntimeException("No permission");
        }
        templateRepository.delete(t);
    }

    private Template createBrainstormTemplate() {
        Map<String, Object> data = new HashMap<>();
        List<Map<String, Object>> elements = new ArrayList<>();
        List<Map<String, Object>> connections = new ArrayList<>();

        Map<String, Object> dataProps = new HashMap<>();
        dataProps.put("text", "中心主题");
        dataProps.put("fontSize", 24);
        dataProps.put("bold", true);
        dataProps.put("fillColor", "#FEF3C7");
        dataProps.put("strokeColor", "#F59E0B");

        Map<String, Object> center = createElementData("mindnode", 0, 0, 200, 80, dataProps);
        elements.add(center);

        String[] branchTexts = {"想法1", "想法2", "想法3", "想法4", "想法5", "想法6"};
        String[] branchColors = {"#DBEAFE", "#DCFCE7", "#FCE7F3", "#F3E8FF", "#FEE2E2", "#FEF9C3"};
        String[] strokeColors = {"#3B82F6", "#22C55E", "#EC4899", "#A855F7", "#EF4444", "#EAB308"};
        double[][] positions = {{-350, -200}, {0, -250}, {350, -200}, {-350, 200}, {0, 250}, {350, 200}};

        for (int i = 0; i < branchTexts.length; i++) {
            Map<String, Object> bp = new HashMap<>();
            bp.put("text", branchTexts[i]);
            bp.put("fontSize", 18);
            bp.put("fillColor", branchColors[i]);
            bp.put("strokeColor", strokeColors[i]);
            Map<String, Object> branch = createElementData("mindnode",
                    positions[i][0], positions[i][1], 160, 60, bp);
            elements.add(branch);

            Map<String, Object> conn = new HashMap<>();
            conn.put("fromElementId", center.get("id"));
            conn.put("toElementId", branch.get("id"));
            conn.put("style", "curve");
            conn.put("color", strokeColors[i]);
            conn.put("thickness", 2);
            conn.put("arrowStyle", "end");
            connections.add(conn);
        }

        data.put("elements", elements);
        data.put("connections", connections);
        data.put("backgroundType", "GRID_DOTS");
        data.put("backgroundColor", "#FFFFFF");

        return Template.builder()
                .name("头脑风暴")
                .description("中心主题 + 放射分支，激发团队创意")
                .category("ideation")
                .isBuiltin(true)
                .data(data)
                .build();
    }

    private Template createProjectPlanTemplate() {
        Map<String, Object> data = new HashMap<>();
        List<Map<String, Object>> elements = new ArrayList<>();
        List<Map<String, Object>> connections = new ArrayList<>();

        String[] phases = {"项目启动", "需求分析", "设计阶段", "开发阶段", "测试阶段", "上线部署"};
        String[] colors = {"#FEE2E2", "#FEF9C3", "#D1FAE5", "#DBEAFE", "#EDE9FE", "#FCE7F3"};
        String[] strokes = {"#EF4444", "#EAB308", "#10B981", "#3B82F6", "#8B5CF6", "#EC4899"};

        for (int i = 0; i < phases.length; i++) {
            Map<String, Object> props = new HashMap<>();
            props.put("text", phases[i]);
            props.put("fontSize", 16);
            props.put("fillColor", colors[i]);
            props.put("strokeColor", strokes[i]);
            props.put("bold", true);
            Map<String, Object> phase = createElementData("rectangle",
                    i * 260 - 650, -40, 220, 80, props);
            elements.add(phase);

            Map<String, Object> mileProps = new HashMap<>();
            mileProps.put("text", "里程碑" + (i + 1));
            mileProps.put("fontSize", 12);
            mileProps.put("fillColor", "#FFFFFF");
            mileProps.put("strokeColor", strokes[i]);
            Map<String, Object> mile = createElementData("diamond",
                    i * 260 - 650 + 110, 100, 80, 50, mileProps);
            elements.add(mile);
        }

        data.put("elements", elements);
        data.put("connections", connections);
        data.put("backgroundType", "GRID_LINES");
        data.put("backgroundColor", "#FAFAFA");

        return Template.builder()
                .name("项目计划")
                .description("甘特图式时间线 + 里程碑")
                .category("planning")
                .isBuiltin(true)
                .data(data)
                .build();
    }

    private Template createUserJourneyTemplate() {
        Map<String, Object> data = new HashMap<>();
        List<Map<String, Object>> elements = new ArrayList<>();

        String[] stages = {"发现", "考虑", "购买", "使用", "忠诚"};
        int[] emotions = {3, 4, 5, 4, 5};

        Map<String, Object> titleProps = new HashMap<>();
        titleProps.put("text", "用户旅程图");
        titleProps.put("fontSize", 24);
        titleProps.put("bold", true);
        titleProps.put("align", "center");
        elements.add(createElementData("text", 0, -250, 400, 40, titleProps));

        for (int i = 0; i < stages.length; i++) {
            Map<String, Object> sp = new HashMap<>();
            sp.put("text", stages[i]);
            sp.put("fontSize", 16);
            sp.put("bold", true);
            sp.put("align", "center");
            sp.put("fillColor", "#EFF6FF");
            sp.put("strokeColor", "#2563EB");
            elements.add(createElementData("rectangle",
                    i * 200 - 400, -150, 160, 50, sp));

            Map<String, Object> tp = new HashMap<>();
            tp.put("text", "触点" + (i + 1));
            tp.put("fontSize", 12);
            tp.put("align", "center");
            elements.add(createElementData("sticky_note",
                    i * 200 - 400 + 30, -50, 100, 80, tp));

            Map<String, Object> pp = new HashMap<>();
            pp.put("text", "情绪值: " + emotions[i] + "/5");
            pp.put("fillColor", "#FEF3C7");
            elements.add(createElementData("text",
                    i * 200 - 400, 80, 160, 40, pp));
        }

        data.put("elements", elements);
        data.put("connections", new ArrayList<>());

        return Template.builder()
                .name("用户旅程")
                .description("横向流程 + 触点标注 + 情绪曲线")
                .category("ux")
                .isBuiltin(true)
                .data(data)
                .build();
    }

    private Template createArchitectureTemplate() {
        Map<String, Object> data = new HashMap<>();
        List<Map<String, Object>> elements = new ArrayList<>();
        List<Map<String, Object>> connections = new ArrayList<>();

        String[][] layers = {
                {"客户端 (Web/App)"},
                {"API 网关"},
                {"用户服务", "订单服务", "支付服务"},
                {"消息队列 / 缓存"},
                {"数据库层 (PostgreSQL/Redis)"}
        };
        String[] layerColors = {"#FEF3C7", "#DBEAFE", "#DCFCE7", "#EDE9FE", "#FEE2E2"};
        String[] layerStrokes = {"#D97706", "#2563EB", "#059669", "#7C3AED", "#DC2626"};

        int baseY = -300;
        Map<String, Object> prevLayerId = null;

        for (int i = 0; i < layers.length; i++) {
            Map<String, Object> firstId = null;
            for (int j = 0; j < layers[i].length; j++) {
                int w = layers[i].length > 1 ? 200 : 500;
                int x = layers[i].length > 1 ? j * 230 - (layers[i].length - 1) * 115 : -250;
                Map<String, Object> p = new HashMap<>();
                p.put("text", layers[i][j]);
                p.put("fontSize", 16);
                p.put("bold", true);
                p.put("fillColor", layerColors[i]);
                p.put("strokeColor", layerStrokes[i]);
                Map<String, Object> el = createElementData("rectangle", x, baseY + i * 120, w, 80, p);
                elements.add(el);
                if (j == 0) firstId = el;
            }
            if (prevLayerId != null && firstId != null) {
                Map<String, Object> conn = new HashMap<>();
                conn.put("fromElementId", prevLayerId.get("id"));
                conn.put("toElementId", firstId.get("id"));
                conn.put("style", "line");
                conn.put("color", "#6B7280");
                conn.put("thickness", 2);
                conn.put("arrowStyle", "end");
                connections.add(conn);
            }
            prevLayerId = firstId;
        }

        data.put("elements", elements);
        data.put("connections", connections);

        return Template.builder()
                .name("架构图")
                .description("分层矩形 + 箭头连接")
                .category("engineering")
                .isBuiltin(true)
                .data(data)
                .build();
    }

    private Template createSwotTemplate() {
        Map<String, Object> data = new HashMap<>();
        List<Map<String, Object>> elements = new ArrayList<>();

        String[][] quadrants = {
                {"优势 Strengths", "#DCFCE7", "#10B981", "-250", "-250"},
                {"劣势 Weaknesses", "#FEE2E2", "#EF4444", "250", "-250"},
                {"机会 Opportunities", "#DBEAFE", "#3B82F6", "-250", "250"},
                {"威胁 Threats", "#FEF3C7", "#F59E0B", "250", "250"}
        };

        for (String[] q : quadrants) {
            Map<String, Object> p = new HashMap<>();
            p.put("text", q[0] + "\n\n• 要点1\n• 要点2\n• 要点3");
            p.put("fontSize", 16);
            p.put("bold", true);
            p.put("fillColor", q[1]);
            p.put("strokeColor", q[2]);
            Map<String, Object> el = createElementData("rectangle",
                    Integer.parseInt(q[3]), Integer.parseInt(q[4]), 300, 280, p);
            elements.add(el);
        }

        data.put("elements", elements);
        data.put("connections", new ArrayList<>());

        return Template.builder()
                .name("SWOT分析")
                .description("2x2象限矩阵分析框架")
                .category("strategy")
                .isBuiltin(true)
                .data(data)
                .build();
    }

    private Template createKanbanTemplate() {
        Map<String, Object> data = new HashMap<>();
        List<Map<String, Object>> elements = new ArrayList<>();

        String[] columns = {"待办", "进行中", "评审中", "已完成"};
        String[] colColors = {"#F3F4F6", "#FEF3C7", "#DBEAFE", "#DCFCE7"};
        String[] colStrokes = {"#6B7280", "#F59E0B", "#3B82F6", "#10B981"};
        String[][] cards = {
                {"任务 A", "任务 B", "任务 C"},
                {"任务 D", "任务 E"},
                {"任务 F"},
                {"任务 G", "任务 H"}
        };

        for (int i = 0; i < columns.length; i++) {
            Map<String, Object> hp = new HashMap<>();
            hp.put("text", columns[i]);
            hp.put("fontSize", 18);
            hp.put("bold", true);
            hp.put("align", "center");
            hp.put("fillColor", colColors[i]);
            hp.put("strokeColor", colStrokes[i]);
            Map<String, Object> header = createElementData("rectangle",
                    i * 240 - 360, -250, 200, 50, hp);
            elements.add(header);

            for (int j = 0; j < cards[i].length; j++) {
                Map<String, Object> cp = new HashMap<>();
                cp.put("text", cards[i][j]);
                cp.put("fontSize", 14);
                cp.put("fillColor", "#FFFFFF");
                cp.put("strokeColor", colStrokes[i]);
                Map<String, Object> card = createElementData("sticky_note",
                        i * 240 - 360 + 20, -170 + j * 110, 160, 90, cp);
                elements.add(card);
            }
        }

        data.put("elements", elements);
        data.put("connections", new ArrayList<>());

        return Template.builder()
                .name("看板")
                .description("多列 + 卡片，管理任务流程")
                .category("project")
                .isBuiltin(true)
                .data(data)
                .build();
    }

    private Map<String, Object> createElementData(String type, double x, double y,
                                                  double w, double h, Map<String, Object> data) {
        Map<String, Object> el = new HashMap<>();
        el.put("id", UUID.randomUUID().toString());
        el.put("type", type);
        el.put("x", x);
        el.put("y", y);
        el.put("width", w);
        el.put("height", h);
        el.put("rotation", 0);
        el.put("opacity", 1);
        el.put("locked", false);
        el.put("visible", true);
        el.put("data", data);
        return el;
    }
}
