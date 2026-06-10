package com.tsukimiai.hoshi.user.config;

import java.util.Properties;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.util.StringUtils;

@Configuration
public class HoshiMailConfiguration {

    private static final Logger log = LoggerFactory.getLogger(HoshiMailConfiguration.class);

    private final ObjectProvider<JavaMailSender> mailSenderProvider;
    private final HoshiMailProperties mailProperties;

    public HoshiMailConfiguration(
            ObjectProvider<JavaMailSender> mailSenderProvider,
            HoshiMailProperties mailProperties) {
        this.mailSenderProvider = mailSenderProvider;
        this.mailProperties = mailProperties;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void configureAndValidateMailSender() {
        JavaMailSender mailSender = mailSenderProvider.getIfAvailable();
        if (!(mailSender instanceof JavaMailSenderImpl mailSenderImpl)) {
            return;
        }
        applyQqCompatibleProperties(mailSenderImpl);
        logMailSenderConfig(mailSenderImpl);
    }

    private static void applyQqCompatibleProperties(JavaMailSenderImpl mailSender) {
        Properties props = mailSender.getJavaMailProperties();
        props.put("mail.smtp.auth", "true");
        props.put("mail.smtp.connectiontimeout", "10000");
        props.put("mail.smtp.timeout", "10000");
        props.put("mail.smtp.writetimeout", "10000");

        int port = mailSender.getPort();
        if (port == 465) {
            props.put("mail.smtp.ssl.enable", "true");
            props.put("mail.smtp.socketFactory.class", "javax.net.ssl.SSLSocketFactory");
            props.put("mail.smtp.socketFactory.port", String.valueOf(port));
            props.put("mail.smtp.socketFactory.fallback", "false");
            props.put("mail.smtp.starttls.enable", "false");
            return;
        }
        if (port == 587) {
            props.put("mail.smtp.starttls.enable", "true");
            props.put("mail.smtp.starttls.required", "true");
            props.put("mail.smtp.ssl.enable", "false");
        }
    }

    private void logMailSenderConfig(JavaMailSenderImpl mailSender) {
        if (!mailProperties.isEnabled()) {
            log.info("Hoshi mail is disabled; verification codes will be logged only");
            return;
        }
        boolean hasUsername = StringUtils.hasText(mailSender.getUsername());
        boolean hasPassword = StringUtils.hasText(mailSender.getPassword());
        boolean hasFrom = StringUtils.hasText(mailProperties.getFrom());
        log.info(
                "Hoshi mail ready: host={}, port={}, usernameConfigured={}, passwordConfigured={}, fromConfigured={}",
                mailSender.getHost(),
                mailSender.getPort(),
                hasUsername,
                hasPassword,
                hasFrom);
        if (!hasUsername || !hasPassword || !hasFrom) {
            log.warn(
                    "SMTP is incomplete. Copy application-local.yml.example to "
                            + "hoshi-server/src/main/resources/application-local.yml "
                            + "or set SMTP_USERNAME / SMTP_PASSWORD / HOSHI_MAIL_FROM");
        }
    }

}
