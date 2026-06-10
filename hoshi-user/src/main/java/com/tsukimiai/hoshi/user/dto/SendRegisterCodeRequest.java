package com.tsukimiai.hoshi.user.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record SendRegisterCodeRequest(@NotBlank @Email String email) {

}
