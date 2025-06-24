package com.infernokun.infernoComics.models;

import lombok.*;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class LoginResponse {
    private String accessToken;      // Short-lived JWT (30 minutes)
    private String refreshToken;     // Long-lived UUID (90 days)
    private UserResponse user;

    // Constructor for backwards compatibility
    public LoginResponse(String accessToken, User user, String refreshToken) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.user = UserResponse.builder()
                .id(user.getId())
                .username(user.getUsername())
                .build();
    }
}

