import { z } from "zod";

export const pageSchema = <Item extends z.ZodType>(item: Item) =>
  z.object({
    items: z.array(item),
    next_page_token: z.string().nullable().optional(),
  });

export interface Page<Item> {
  items: Item[];
  next_page_token?: string | null;
}
