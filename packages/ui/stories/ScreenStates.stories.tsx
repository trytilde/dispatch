import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  EmptyState,
  ErrorNotice,
  LoadingRows,
  PageHeader,
  Field,
  Input,
  ControlButton,
  Dialog,
  DialogTrigger,
  FormDialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@tryopenbot/ui";
const meta = { title: "Primitives/Screen states" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const States: Story = {
  render: () => (
    <div className="grid max-w-xl gap-6">
      <PageHeader
        title="Your resources"
        description="Manage resources you use with your assistants."
      />
      <LoadingRows rows={2} />
      <EmptyState title="No resources yet" body="Add a resource to get started." />
      <ErrorNotice message="We could not load your resources. Try again." />
    </div>
  ),
};
export const FormDialog: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <ControlButton>Edit resource</ControlButton>
      </DialogTrigger>
      <FormDialogContent>
        <DialogHeader>
          <DialogTitle>Edit resource</DialogTitle>
          <DialogDescription>Choose a name you can recognize.</DialogDescription>
        </DialogHeader>
        <Field label="Name" htmlFor="resource-name">
          <Input id="resource-name" defaultValue="Personal tools" />
        </Field>
        <DialogFooter>
          <DialogClose asChild>
            <ControlButton variant="outline">Cancel</ControlButton>
          </DialogClose>
          <DialogClose asChild>
            <ControlButton>Save</ControlButton>
          </DialogClose>
        </DialogFooter>
      </FormDialogContent>
    </Dialog>
  ),
};
