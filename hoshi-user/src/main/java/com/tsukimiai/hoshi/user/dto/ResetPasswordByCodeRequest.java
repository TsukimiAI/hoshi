package com.tsukimiai.hoshi.user.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ResetPasswordByCodeRequest(
        @NotBlank @Email String email,
        @NotBlank @Pattern(regexp = "\\d{6}", message = "验证码必须为 6 位数字") String emailCode,
        @NotBlank @Size(min = 8, max = 64) String newPassword) {

}
