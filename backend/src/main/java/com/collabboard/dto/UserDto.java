package com.collabboard.dto;

import com.collabboard.entity.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserDto {
    private UUID id;
    private String email;
    private String username;
    private String avatarUrl;
    private String color;
    private String token;

    public static UserDto fromEntity(User user) {
        return UserDto.builder()
                .id(user.getId())
                .email(user.getEmail())
                .username(user.getUsername())
                .avatarUrl(user.getAvatarUrl())
                .color(user.getColor())
                .build();
    }

    public static UserDto fromEntityWithToken(User user, String token) {
        UserDto dto = fromEntity(user);
        dto.setToken(token);
        return dto;
    }
}
