package com.tsukimiai.hoshi.conversation.config;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
public class CognitionBackgroundTaskConfiguration {

    @Bean(name = "cognitionBackgroundTaskExecutorBean")
    public ThreadPoolTaskExecutor cognitionBackgroundTaskExecutorBean() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setThreadNamePrefix("hoshi-cognition-");
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(64);
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.initialize();
        return executor;
    }

    @Bean
    public com.tsukimiai.hoshi.conversation.application.CognitionBackgroundTaskExecutor cognitionBackgroundTaskExecutor(
            ThreadPoolTaskExecutor cognitionBackgroundTaskExecutorBean) {
        return new DefaultCognitionBackgroundTaskExecutor(cognitionBackgroundTaskExecutorBean);
    }

    static final class DefaultCognitionBackgroundTaskExecutor
            implements com.tsukimiai.hoshi.conversation.application.CognitionBackgroundTaskExecutor {

        private static final Logger log = LoggerFactory.getLogger(DefaultCognitionBackgroundTaskExecutor.class);

        private final Executor executor;

        DefaultCognitionBackgroundTaskExecutor(Executor executor) {
            this.executor = executor;
        }

        @Override
        public void submit(String taskName, Runnable task) {
            executor.execute(() -> {
                try {
                    task.run();
                } catch (Exception ex) {
                    log.warn("Cognition background task failed: {}", taskName, ex);
                }
            });
        }

        @Override
        public <T> java.util.concurrent.CompletableFuture<T> supplyAsync(String taskName, java.util.function.Supplier<T> supplier) {
            return java.util.concurrent.CompletableFuture.supplyAsync(() -> {
                try {
                    return supplier.get();
                } catch (Exception ex) {
                    log.warn("Cognition background task failed: {}", taskName, ex);
                    throw ex;
                }
            }, executor);
        }
    }
}
