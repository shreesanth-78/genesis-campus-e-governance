// Per-club settings for the Club Space. A club without a row uses the defaults (everyone can post, joining is open).
export async function up(knex) {
  await knex.schema.createTable('gov_club_settings', (t) => {
    t.string('club_id', 64).primary();
    t.boolean('members_can_post').notNullable().defaultTo(true);
    t.boolean('join_open').notNullable().defaultTo(true);
    t.string('updated_at', 30).notNullable();
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('gov_club_settings');
}
