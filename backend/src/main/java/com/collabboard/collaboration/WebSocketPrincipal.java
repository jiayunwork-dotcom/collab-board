package com.collabboard.collaboration;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.security.Principal;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class WebSocketPrincipal implements Principal {
    private UUID userId;
    private boolean anonymous;
    private String name;

    public WebSocketPrincipal(UUID userId, boolean anonymous) {
        this.userId = userId;
        this.anonymous = anonymous;
        this.name = userId.toString();
    }

    @Override
    public String getName() {
        return name != null ? name : userId.toString();
    }
}
