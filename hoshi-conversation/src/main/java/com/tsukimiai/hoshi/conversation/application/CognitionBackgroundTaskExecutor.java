package com.tsukimiai.hoshi.conversation.application;

import java.util.concurrent.CompletableFuture;
import java.util.function.Supplier;

/**
 * 认知类后台任务统一入口，替代散落的 {@code CompletableFuture.runAsync}。
 */
public interface CognitionBackgroundTaskExecutor {

    void submit(String taskName, Runnable task);

    <T> CompletableFuture<T> supplyAsync(String taskName, Supplier<T> supplier);
}
