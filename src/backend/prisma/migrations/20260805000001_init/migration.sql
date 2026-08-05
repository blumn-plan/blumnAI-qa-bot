-- CreateTable
CREATE TABLE `teams` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(64) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `github_repo` VARCHAR(255) NOT NULL,
    `master_github_login` VARCHAR(64) NULL,
    `master_pat` TEXT NULL,
    `anthropic_key` TEXT NULL,
    `planner_password` VARCHAR(255) NULL,
    `rate_limit_per_day` INTEGER NOT NULL DEFAULT 50,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `teams_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `projects` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `team_id` INTEGER NOT NULL,
    `slug` VARCHAR(64) NOT NULL,
    `label` VARCHAR(255) NOT NULL,
    `policies_dir` VARCHAR(500) NOT NULL DEFAULT '',
    `storyboards_dir` VARCHAR(500) NOT NULL DEFAULT '',
    `code_repo` VARCHAR(255) NOT NULL DEFAULT '',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `projects_team_id_slug_key`(`team_id`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_team_id_fkey` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

