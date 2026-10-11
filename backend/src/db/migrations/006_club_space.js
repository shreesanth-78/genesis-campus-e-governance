// Club Space: who has joined a club, and the announcements and discussion posts members share inside it.
export async function up(knex) {
  await knex.schema.createTable('gov_club_members', (t) => {
    t.string('club_id', 64).notNullable();
    t.string('user_id', 36).notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('joined_at', 30).notNullable();
    t.primary(['club_id', 'user_id']);
    t.index(['user_id']);
  });

  await knex.schema.createTable('gov_club_posts', (t) => {
    t.string('id', 40).primary();
    t.string('club_id', 64).notNullable();
    // null for the welcome post the sample data starts with
    t.string('user_id', 36).nullable().references('id').inTable('users').onDelete('SET NULL');
    t.string('author_name', 120).notNullable();
    t.string('author_role', 12).notNullable().checkIn(['member', 'authority']);
    t.string('kind', 14).notNullable().checkIn(['announcement', 'discussion']);
    t.string('event_id', 64).nullable();
    t.text('body').notNullable();
    t.string('created_at', 30).notNullable();
    t.index(['club_id', 'created_at']);
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('gov_club_posts');
  await knex.schema.dropTableIfExists('gov_club_members');
}
