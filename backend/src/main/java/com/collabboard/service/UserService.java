package com.collabboard.service;

import com.collabboard.config.JwtTokenProvider;
import com.collabboard.dto.AuthRequest;
import com.collabboard.dto.UserDto;
import com.collabboard.entity.User;
import com.collabboard.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class UserService {

    private static final String[] USER_COLORS = {
            "#4F46E5", "#DC2626", "#059669", "#D97706",
            "#7C3AED", "#DB2777", "#0891B2", "#65A30D",
            "#EA580C", "#2563EB", "#9333EA", "#0891B2"
    };

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final SecureRandom random = new SecureRandom();

    public UserService(UserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       JwtTokenProvider jwtTokenProvider) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenProvider = jwtTokenProvider;
    }

    @Transactional
    public UserDto register(AuthRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new RuntimeException("Email already registered");
        }

        String color = USER_COLORS[random.nextInt(USER_COLORS.length)];

        User user = User.builder()
                .email(request.getEmail())
                .username(request.getUsername())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .color(color)
                .build();

        user = userRepository.save(user);
        String token = jwtTokenProvider.generateToken(user.getId());
        return UserDto.fromEntityWithToken(user, token);
    }

    @Transactional
    public UserDto login(AuthRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new RuntimeException("Invalid credentials"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new RuntimeException("Invalid credentials");
        }

        String token = jwtTokenProvider.generateToken(user.getId());
        return UserDto.fromEntityWithToken(user, token);
    }

    public UserDto getById(UUID id) {
        return userRepository.findById(id)
                .map(UserDto::fromEntity)
                .orElseThrow(() -> new RuntimeException("User not found"));
    }

    public User getEntityById(UUID id) {
        return userRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("User not found"));
    }

    public Optional<User> findById(UUID id) {
        return userRepository.findById(id);
    }

    public List<UserDto> getAllByIds(List<UUID> ids) {
        return userRepository.findAllById(ids).stream()
                .map(UserDto::fromEntity)
                .toList();
    }

    @Transactional
    public UserDto updateUser(UUID id, UserDto dto) {
        User user = getEntityById(id);
        if (dto.getUsername() != null) user.setUsername(dto.getUsername());
        if (dto.getAvatarUrl() != null) user.setAvatarUrl(dto.getAvatarUrl());
        if (dto.getColor() != null) user.setColor(dto.getColor());
        return UserDto.fromEntity(userRepository.save(user));
    }
}
