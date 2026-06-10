package com.tsukimiai.hoshi.user.service.impl;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import org.springframework.util.StringUtils;

import com.tsukimiai.hoshi.common.exception.BusinessException;
import com.tsukimiai.hoshi.common.exception.ErrorCode;
import com.tsukimiai.hoshi.user.config.HoshiAppProperties;
import com.tsukimiai.hoshi.user.config.HoshiMailProperties;
import com.tsukimiai.hoshi.user.entity.User;
import com.tsukimiai.hoshi.user.service.EmailService;

@Service
public class SmtpEmailService implements EmailService {

    private static final Logger log = LoggerFactory.getLogger(SmtpEmailService.class);

    private final JavaMailSender mailSender;
    private final HoshiMailProperties mailProperties;
    private final HoshiAppProperties appProperties;

    public SmtpEmailService(
            @Autowired(required = false) JavaMailSender mailSender,
            HoshiMailProperties mailProperties,
            HoshiAppProperties appProperties) {
        this.mailSender = mailSender;
        this.mailProperties = mailProperties;
        this.appProperties = appProperties;
    }

    @Override
    public void sendVerificationEmail(User user, String rawToken) {
        String link = buildLink("/verify-email", rawToken);
        String subject = "【Hoshi】验证你的邮箱";
        String text = """
                你好，%s：

                欢迎注册 Hoshi（拾星）。请点击以下链接完成邮箱验证（24 小时内有效）：

                %s

                如果这不是你的操作，请忽略此邮件。
                """.formatted(user.getUsername(), link);
        send(user.getEmail(), subject, text);
    }

    @Override
    public void sendRegisterCode(String email, String code) {
        String subject = "【Hoshi】注册验证码";
        String text = """
                你好：

                你正在注册 Hoshi（拾星），验证码为：%s

                验证码 10 分钟内有效，请勿泄露给他人。

                如果这不是你的操作，请忽略此邮件。
                """.formatted(code);
        send(email, subject, text);
    }

    @Override
    public void sendPasswordResetCode(String email, String code) {
        String subject = "【Hoshi】重置密码验证码";
        String text = """
                你好：

                你正在重置 Hoshi（拾星）账号密码，验证码为：%s

                验证码 10 分钟内有效，请勿泄露给他人。

                如果这不是你的操作，请忽略此邮件。
                """.formatted(code);
        send(email, subject, text);
    }

    @Override
    public void sendPasswordResetEmail(User user, String rawToken) {
        String link = buildLink("/reset-password", rawToken);
        String subject = "【Hoshi】重置你的密码";
        String text = """
                你好，%s：

                我们收到了你的密码重置请求。请点击以下链接设置新密码（30 分钟内有效）：

                %s

                如果这不是你的操作，请忽略此邮件，你的密码不会变更。
                """.formatted(user.getUsername(), link);
        send(user.getEmail(), subject, text);
    }

    private String buildLink(String path, String rawToken) {
        String baseUrl = appProperties.getPublicUrl().replaceAll("/$", "");
        return baseUrl + path + "?token=" + rawToken;
    }

    private void send(String to, String subject, String text) {
        if (!mailProperties.isEnabled() || mailSender == null) {
            log.info("Mail disabled, skip sending '{}' to {}", subject, to);
            log.info("Mail body:\n{}", text);
            return;
        }
        if (!StringUtils.hasText(mailProperties.getFrom())) {
            throw new BusinessException(ErrorCode.INTERNAL_ERROR, "SMTP 发件人未配置，请设置 HOSHI_MAIL_FROM 或 application-local.yml");
        }

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(mailProperties.getFrom());
        message.setTo(to);
        message.setSubject(subject);
        message.setText(text);
        mailSender.send(message);
        log.info("Sent mail '{}' to {}", subject, to);
    }

}
