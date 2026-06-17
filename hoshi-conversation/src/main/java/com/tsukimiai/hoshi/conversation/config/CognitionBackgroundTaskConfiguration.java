package com.tsukimiai.hoshi.conversation.config;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import io.micrometer.core.instrument.FunctionCounter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;

@Configuration
public class CognitionBackgroundTaskConfiguration {

    private static final String EXECUTOR_NAME = "cognition";
    private static final String THREAD_NAME_PREFIX = "hoshi-cognition-";

    @Bean(name = "cognitionBackgroundTaskExecutorBean")
    public ThreadPoolTaskExecutor cognitionBackgroundTaskExecutorBean(ObjectProvider<MeterRegistry> meterRegistryProvider) {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setThreadNamePrefix(THREAD_NAME_PREFIX);
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(64);
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.initialize();
        MeterRegistry meterRegistry = meterRegistryProvider.getIfAvailable();
        if (meterRegistry != null && executor.getThreadPoolExecutor() != null) {
            registerExecutorMetrics(meterRegistry, executor.getThreadPoolExecutor());
        }
        return executor;
    }

    @Bean
    public com.tsukimiai.hoshi.conversation.application.CognitionBackgroundTaskExecutor cognitionBackgroundTaskExecutor(
            ThreadPoolTaskExecutor cognitionBackgroundTaskExecutorBean,
            ObjectProvider<MeterRegistry> meterRegistryProvider) {
        return new DefaultCognitionBackgroundTaskExecutor(
                cognitionBackgroundTaskExecutorBean,
                meterRegistryProvider.getIfAvailable());
    }

    private void registerExecutorMetrics(MeterRegistry meterRegistry, ThreadPoolExecutor executor) {
        Gauge.builder("hoshi.cognition.executor.pool.core", executor, ThreadPoolExecutor::getCorePoolSize)
                .tag("executor", EXECUTOR_NAME)
                .register(meterRegistry);
        Gauge.builder("hoshi.cognition.executor.pool.max", executor, ThreadPoolExecutor::getMaximumPoolSize)
                .tag("executor", EXECUTOR_NAME)
                .register(meterRegistry);
        Gauge.builder("hoshi.cognition.executor.active", executor, ThreadPoolExecutor::getActiveCount)
                .tag("executor", EXECUTOR_NAME)
                .register(meterRegistry);
        Gauge.builder("hoshi.cognition.executor.queue.size", executor, value -> value.getQueue().size())
                .tag("executor", EXECUTOR_NAME)
                .register(meterRegistry);
        FunctionCounter.builder(
                        "hoshi.cognition.executor.completed.total",
                        executor,
                        value -> (double) value.getCompletedTaskCount())
                .tag("executor", EXECUTOR_NAME)
                .register(meterRegistry);
    }

    static final class DefaultCognitionBackgroundTaskExecutor
            implements com.tsukimiai.hoshi.conversation.application.CognitionBackgroundTaskExecutor {

        private static final Logger log = LoggerFactory.getLogger(DefaultCognitionBackgroundTaskExecutor.class);

        private final Executor executor;
        private final MeterRegistry meterRegistry;

        DefaultCognitionBackgroundTaskExecutor(Executor executor, MeterRegistry meterRegistry) {
            this.executor = executor;
            this.meterRegistry = meterRegistry;
        }

        @Override
        public void submit(String taskName, Runnable task) {
            recordTaskCounter(taskName, "submitted");
            executor.execute(() -> {
                long startTime = System.nanoTime();
                recordCallerRuns(taskName);
                try {
                    task.run();
                    recordTaskCounter(taskName, "success");
                    recordTaskDuration(taskName, "success", startTime);
                } catch (Exception ex) {
                    recordTaskCounter(taskName, "failure");
                    recordTaskDuration(taskName, "failure", startTime);
                    log.warn("Cognition background task failed: {}", taskName, ex);
                }
            });
        }

        @Override
        public <T> java.util.concurrent.CompletableFuture<T> supplyAsync(String taskName, java.util.function.Supplier<T> supplier) {
            recordTaskCounter(taskName, "submitted");
            return java.util.concurrent.CompletableFuture.supplyAsync(() -> {
                long startTime = System.nanoTime();
                recordCallerRuns(taskName);
                try {
                    T result = supplier.get();
                    recordTaskCounter(taskName, "success");
                    recordTaskDuration(taskName, "success", startTime);
                    return result;
                } catch (Exception ex) {
                    recordTaskCounter(taskName, "failure");
                    recordTaskDuration(taskName, "failure", startTime);
                    log.warn("Cognition background task failed: {}", taskName, ex);
                    throw ex;
                }
            }, executor);
        }

        private void recordTaskCounter(String taskName, String outcome) {
            if (meterRegistry == null) {
                return;
            }
            meterRegistry.counter(
                    "hoshi.cognition.background.tasks.total",
                    "task_name", sanitize(taskName),
                    "outcome", outcome)
                    .increment();
        }

        private void recordTaskDuration(String taskName, String outcome, long startTime) {
            if (meterRegistry == null) {
                return;
            }
            Timer.builder("hoshi.cognition.background.task.duration")
                    .description("Duration of cognition background tasks")
                    .tag("task_name", sanitize(taskName))
                    .tag("outcome", outcome)
                    .register(meterRegistry)
                    .record(java.time.Duration.ofNanos(System.nanoTime() - startTime));
        }

        private void recordCallerRuns(String taskName) {
            if (meterRegistry == null) {
                return;
            }
            if (!Thread.currentThread().getName().startsWith(THREAD_NAME_PREFIX)) {
                meterRegistry.counter(
                        "hoshi.cognition.background.tasks.caller_runs.total",
                        "task_name", sanitize(taskName))
                        .increment();
            }
        }

        private String sanitize(String taskName) {
            return taskName == null || taskName.isBlank() ? "unknown" : taskName.trim();
        }
    }
}
