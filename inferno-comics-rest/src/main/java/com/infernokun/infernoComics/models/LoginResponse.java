package com.infernokun.infernoComics.models;

import lombok.*;

@Data
@AllArgsConstructor
@NoArgsConstructor
public class LoginResponse {
    private String accessToken;
    private String refreshToken;
    private UserResponse user;

    public LoginResponse(String accessToken, User user, String refreshToken) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.user = UserResponse.builder()
                .id(user.getId())
                .username(user.getUsername())
                .build();
    }
}

