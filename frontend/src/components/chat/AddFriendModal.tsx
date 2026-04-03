import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogOverlay,
} from "../ui/dialog";
import { UserPlus } from "lucide-react";
import type { User } from "@/types/user";
import { useFriendStore } from "@/stores/useFriendStore";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import SearchForm from "@/components/AddFriendModal/SearchForm";
import SendFriendRequestForm from "@/components/AddFriendModal/SendFriendRequestForm";

export interface IFormValues {
  username: string;
  message: string;
}

const AddFriendModal = () => {
  const [open, setOpen] = useState(false);
  const [isFound, setIsFound] = useState<boolean | null>(null);
  const [searchUser, setSearchUser] = useState<User>();
  const [searchedUsername, setSearchedUsername] = useState("");
  const { loading, searchByUsername, addFriend } = useFriendStore();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<IFormValues>({
    defaultValues: { username: "", message: "" },
  });

  const usernameValue = watch("username");

  const handleSearch = handleSubmit(async (data) => {
    const username = data.username.trim();
    if (!username) return;

    setIsFound(null);
    setSearchedUsername(username);

    try {
      const foundUser = await searchByUsername(username);
      if (foundUser) {
        setIsFound(true);
        setSearchUser(foundUser);
      } else {
        setIsFound(false);
      }
    } catch (error) {
      console.error(error);
      setIsFound(false);
    }
  });

  const handleSend = handleSubmit(async (data) => {
    if (!searchUser) return;

    try {
      const message = await addFriend(searchUser._id, data.message.trim());
      toast.success(message);

      handleCancel();
    } catch (error) {
      console.error("Error while submitting request from form", error);
    }
  });

  const handleCancel = () => {
    reset();
    setSearchedUsername("");
    setIsFound(null);
    setOpen(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (loading && !nextOpen) {
      return;
    }

    if (!nextOpen) {
      reset();
      setSearchedUsername("");
      setIsFound(null);
    }

    setOpen(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <div className="flex justify-center items-center size-5 rounded-full hover:bg-sidebar-accent/80 cursor-pointer z-10">
          <UserPlus className="size-4" />
          <span className="sr-only">Add friend</span>
        </div>
      </DialogTrigger>

      <DialogOverlay className="modal-overlay" />
      <DialogContent
        className="modal-content-shell sm:max-w-[425px] border-none"
        dismissible={!loading}
        showCloseButton={!loading}
      >
        <DialogHeader className="modal-stagger-item">
          <DialogTitle>Add Friend</DialogTitle>
          <DialogDescription className="sr-only">
            Search and send a friend request
          </DialogDescription>
        </DialogHeader>

        {!isFound && (
          <div className="modal-stagger-item">
            <SearchForm
              register={register}
              errors={errors}
              usernameValue={usernameValue}
              loading={loading}
              isFound={isFound}
              searchedUsername={searchedUsername}
              onSubmit={handleSearch}
              onCancel={handleCancel}
            />
          </div>
        )}

        {isFound && (
          <div className="modal-stagger-item">
            <SendFriendRequestForm
              register={register}
              loading={loading}
              searchedUsername={searchedUsername}
              onSubmit={handleSend}
              onBack={() => setIsFound(null)}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AddFriendModal;
