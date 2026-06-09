package com.collabboard.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "operation_logs")
public class OperationLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "canvas_id", nullable = false)
    private UUID canvasId;

    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "operation_type", nullable = false, length = 50)
    private String operationType;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "operation_data", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> operationData;

    @Builder.Default
    private OffsetDateTime timestamp = OffsetDateTime.now();
}
