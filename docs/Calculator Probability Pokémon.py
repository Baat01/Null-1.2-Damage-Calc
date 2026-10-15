# -*- coding: utf-8 -*-
"""
Created by Naiyo

"""

import tkinter as tk


class Data(tk.Tk):
    __slots__ = ["radio1_1","radio1_2","choice1_1","bouton1_1"]
    
    def __init__(self):        
        super().__init__()
        self.title("Choose your option")
        self.resizable(height = True, width = True)
        self.geometry("350x200")
        self.widgets1()
        

    def widgets1(self):

        self.choice1_1 = tk.StringVar()
        self.choice1_1.set("Message")
        
        self.radio1_1 = tk.Radiobutton(self, text="Multiple moves", variable=self.choice1_1, value="Overlapping roll", font = '15')
        self.radio1_1.grid(row=1, column=0)
        self.radio1_2 = tk.Radiobutton(self, text="Overlapping roll", variable=self.choice1_1, value="Multiple roll",font = '15')
        self.radio1_2.grid(row=1, column=1)

        self.select = tk.Label(self, text="\nSelect :", font='Helvetica 15 bold')
        self.select.grid(row=0, column=0, columnspan=2)
        
        self.bouton1_1 = tk.Button(self, text="Press", font = '15')
        self.bouton1_1.bind('<Button-1>',self.execute_choix)
        self.bouton1_1.grid(row=2, column=0, columnspan=2)
       

        
    def execute_choix(self,event):
        if self.choice1_1.get() == "Overlapping roll": 
            self.destroy()
            self.screen2_1()
        if self.choice1_1.get() == "Multiple roll": 
            self.destroy()
            self.screen2_2()

    def screen2_1(self):
        class Data(tk.Tk):
            __slots__ = ["bouton2_1"]
            
            def __init__(self):        
                super().__init__()
                self.title("Multiple moves")
                self.resizable(height = True, width = True)
                self.widgets2()
                
                
                
            def widgets2(self):
                self.select = tk.Label(self, text="\nComplete with rolls for every move you need and current HP (rolls without parenthesis () ex : 16, 17, 18,...) :", font='Helvetica 13 bold')
                self.select.grid(row=0, column=0, columnspan=2)
                
                self.select = tk.Label(self, text="Move 1 :", font='Helvetica 13 bold')
                self.select.grid(row=1, column=0)
                
                self.entry1 = tk.Entry(self)
                self.entry1.grid(row=1, column=1)

                self.select = tk.Label(self, text="Move 2 :", font='Helvetica 13 bold')
                self.select.grid(row=2, column=0)
                
                self.entry2 = tk.Entry(self)
                self.entry2.grid(row=2, column=1)
                
                self.select = tk.Label(self, text="Move 3 :", font='Helvetica 13 bold')
                self.select.grid(row=3, column=0)
                
                self.entry3 = tk.Entry(self)
                self.entry3.grid(row=3, column=1)

                self.select = tk.Label(self, text="Move 4 :", font='Helvetica 13 bold')
                self.select.grid(row=4, column=0)
                
                self.entry4 = tk.Entry(self)
                self.entry4.grid(row=4, column=1)
                
                self.select = tk.Label(self, text="Move 5 :", font='Helvetica 13 bold')
                self.select.grid(row=5, column=0)
                
                self.entry5 = tk.Entry(self)
                self.entry5.grid(row=5, column=1)
                
                self.select = tk.Label(self, text="Move 6 :", font='Helvetica 13 bold')
                self.select.grid(row=6, column=0)
                
                self.entry6 = tk.Entry(self)
                self.entry6.grid(row=6, column=1)
                
                self.select = tk.Label(self, text="Move 7 :", font='Helvetica 13 bold')
                self.select.grid(row=7, column=0)
                
                self.entry7 = tk.Entry(self)
                self.entry7.grid(row=7, column=1)
                

                self.entryHP = tk.Entry(self)
                self.entryHP.insert(0, "")
                self.entryHP.grid(row=1, column=2)
                
                self.select = tk.Label(self, text="\nCurrent HP :", font='Helvetica 13 bold')
                self.select.grid(row=0, column=2, columnspan=2)
                
                self.bouton2_1 = tk.Button(self, text="Press")
                self.bouton2_1.bind('<Button-1>',self.calcul_roll)
                self.bouton2_1.grid(row=3, column=2, columnspan=2)
                
            def calcul_roll(self, event):
                HP = int(self.entryHP.get())
                roll1 = self.entry1.get()
                roll2 = self.entry2.get()
                roll3 = self.entry3.get()
                roll4 = self.entry4.get()
                roll5 = self.entry5.get()
                roll6 = self.entry6.get()
                roll7 = self.entry7.get()


                
                roll1 = self.verif_roll(roll1)
                roll2 = self.verif_roll(roll2)
                roll3 = self.verif_roll(roll3)
                roll4 = self.verif_roll(roll4)
                roll5 = self.verif_roll(roll5)
                roll6 = self.verif_roll(roll6)
                roll7 = self.verif_roll(roll7)



                
                # Cette partie est pour enlever les rolls non rempli

                liste_roll = [roll1 ,roll2, roll3, roll4, roll5, roll6, roll7]
                a = 0
                for i in liste_roll:
                    if i == []:
                        a += 1
                for i in range(0, a):
                    liste_roll.remove([])
                
                
                if len(liste_roll) == 2:
                    self.proba_2roll(liste_roll, HP)
                if len(liste_roll) == 3:
                    self.proba_3roll(liste_roll, HP)
                if len(liste_roll) == 4:
                    self.proba_4roll(liste_roll, HP)
                if len(liste_roll) == 5:
                    self.proba_5roll(liste_roll, HP)
                if len(liste_roll) == 6:
                    self.proba_6roll(liste_roll, HP)
                if len(liste_roll) == 7:
                    self.proba_7roll(liste_roll, HP)
                   
                    
            def proba_2roll (self, liste_roll, HP):
                nb_issues = len(liste_roll[0]) * len(liste_roll[1])
                kill = 0
                for i in liste_roll[0] :
                    for j in liste_roll[1]:
                        if i+j >= HP:
                            kill += 1
                proba = round(kill/nb_issues*100,6)
                print(f"{proba}% chance to kill")
            

                    
            
            def proba_3roll (self, liste_roll, HP):
                nb_issues = len(liste_roll[0]) * len(liste_roll[1]) * len(liste_roll[2])
                kill = 0
                for i in liste_roll[0] :
                    for j in liste_roll[1]:
                        for x in liste_roll[2]:
                            if i+j+x >= HP:
                                kill += 1
                proba = round(kill/nb_issues*100,6)
                print(f"{proba}% chance to kill")
            
            
            def proba_4roll (self, liste_roll, HP):
                nb_issues = len(liste_roll[0]) * len(liste_roll[1]) * len(liste_roll[2]) * len(liste_roll[3])
                kill = 0
                for i in liste_roll[0] :
                    for j in liste_roll[1]:
                        for x in liste_roll[2]:
                            for y in liste_roll[3]:
                                if i+j+x+y >= HP:
                                    kill += 1
                proba = round(kill/nb_issues*100,6)
                print(f"{proba}% chance to kill")
            
            
            def proba_5roll (self, liste_roll, HP):
                nb_issues = len(liste_roll[0]) * len(liste_roll[1]) * len(liste_roll[2]) * len(liste_roll[3] * len(liste_roll[4]))
                kill = 0
                for i in liste_roll[0] :
                    for j in liste_roll[1]:
                        for x in liste_roll[2]:
                            for y in liste_roll[3]:
                                for w in liste_roll[4]:
                                    if i+j+x+y+w >= HP:
                                        kill += 1
                proba = round(kill/nb_issues*100,6)
                print(f"{proba}% chance to kill")
                
            def proba_6roll (self, liste_roll, HP):
                nb_issues = len(liste_roll[0]) * len(liste_roll[1]) * len(liste_roll[2]) * len(liste_roll[3] * len(liste_roll[4]) * len(liste_roll[5]))
                kill = 0
                for i in liste_roll[0] :
                    for j in liste_roll[1]:
                        for x in liste_roll[2]:
                            for y in liste_roll[3]:
                                for w in liste_roll[4]:
                                    for z in liste_roll[5]:
                                        if i+j+x+y+w+z >= HP:
                                            kill += 1
                proba = round(kill/nb_issues*100,8)
                print(f"{proba}% chance to kill")
                
            def proba_7roll (self, liste_roll, HP):
                nb_issues = len(liste_roll[0]) * len(liste_roll[1]) * len(liste_roll[2]) * len(liste_roll[3] * len(liste_roll[4]) * len(liste_roll[5]) * len(liste_roll[6]) )
                kill = 0
                for i in liste_roll[0] :
                    for j in liste_roll[1]:
                        for x in liste_roll[2]:
                            for y in liste_roll[3]:
                                for w in liste_roll[4]:
                                    for z in liste_roll[5]:
                                        for a in liste_roll[6]:
                                            if i+j+x+y+w+z+a >= HP:
                                                kill += 1
                proba = round(kill/nb_issues*100,10)
                print(f"{proba}% chance to kill") 
                
              
            
            def conv_roll(self, roll):
                roll = roll.split(",")
                liste_roll =[]
                for i in roll:
                    liste_roll.append(int(i))
                return liste_roll
            
            def verif_roll(self, roll):
                if roll == '':
                    roll = []
                else : 
                    roll = self.conv_roll(roll)
                return roll
                
        if __name__ == "__main__":
            app = Data()
            app.mainloop()
            
    def screen2_2(self):
        class Data(tk.Tk):
            __slots__ = ["bouton2_1"]
                
            def __init__(self):        
                super().__init__()
                self.title("Overlapping Roll")
                self.resizable(height = True, width = True)
                self.widgets3()
                    
            def widgets3(self):
                self.select = tk.Label(self, text="\nComplete with rolls for every move you need and current HP only if at least one move can kill (rolls without parenthesis () ex : 16, 17, 18,...) :", font='Helvetica 13 bold')
                self.select.grid(row=0, column=0, columnspan=2)
                    
                self.select = tk.Label(self, text="Move1 :", font='Helvetica 13 bold')
                self.select.grid(row=1, column=0)
                    
                self.entry1 = tk.Entry(self)
                self.entry1.grid(row=1, column=1)

                self.select = tk.Label(self, text="Move2 :", font='Helvetica 13 bold')
                self.select.grid(row=2, column=0)
                    
                self.entry2 = tk.Entry(self)
                self.entry2.grid(row=2, column=1)
                    
                self.select = tk.Label(self, text="Move3 :", font='Helvetica 13 bold')
                self.select.grid(row=3, column=0)
                    
                       
                self.entry3 = tk.Entry(self)
                self.entry3.grid(row=3, column=1)
                
                self.select = tk.Label(self, text="Move4 :", font='Helvetica 13 bold')
                self.select.grid(row=4, column=0)
                
                self.entry4 = tk.Entry(self)
                self.entry4.grid(row=4, column=1)
                
                
                self.entryHP = tk.Entry(self)
                self.entryHP.insert(0, "")
                self.entryHP.grid(row=1, column=2)
                
                self.select = tk.Label(self, text="\nCurrent HP :", font='Helvetica 13 bold')
                self.select.grid(row=0, column=2, columnspan=2)

                    
                self.bouton2_1 = tk.Button(self, text="Press")
                self.bouton2_1.bind('<Button-1>',self.calcul_roll)
                self.bouton2_1.grid(row=3, column=2, columnspan=2)
                    
                    
                    
            def calcul_roll(self, event):
                 HP = self.entryHP.get()
                 roll1 = self.entry1.get()
                 roll2 = self.entry2.get()
                 roll3 = self.entry3.get()
                 roll4 = self.entry4.get()


                 
                 roll1 = self.verif_roll(roll1)
                 roll2 = self.verif_roll(roll2)
                 roll3 = self.verif_roll(roll3)
                 roll4 = self.verif_roll(roll4)


                 
                 # Cette partie est pour enlever les rolls non rempli

                 liste_roll = [roll1 ,roll2, roll3, roll4]
                 a = 0
                 for i in liste_roll:
                     if i == []:
                         a += 1
                 for i in range(0, a):
                     liste_roll.remove([])
                 if HP == '':
                    if len(liste_roll) == 2:
                        self.overlap2(liste_roll)
                    if len(liste_roll) == 3:
                        self.overlap3(liste_roll)
                    if len(liste_roll) == 4:
                        self.overlap4(liste_roll)   
                 else:
                    HP = int(HP)
                    if len(liste_roll) == 2:
                        self.overlap2_kill(liste_roll,HP)
                    if len(liste_roll) == 3:
                        self.overlap3_kill(liste_roll,HP)
                    if len(liste_roll) == 4:
                        self.overlap4_kill(liste_roll,HP)   
                        
                 
                
                 
            def conv_roll(self, roll):
                roll = roll.split(",")
                liste_roll =[]
                for i in roll:
                    liste_roll.append(int(i))
                return liste_roll
            
            def verif_roll(self, roll):
                if roll == '':
                    roll = []
                else : 
                    roll = self.conv_roll(roll)
                return roll
            
            
            
                 
            def overlap2 (self, liste_roll):
                nb_issues = len(liste_roll[0]) * len(liste_roll[1])
                roll1 = 0
                roll2 = 0
                for i in liste_roll[0] :
                    for j in liste_roll[1]:
                        if i > j:
                            roll1 += 1
                        if i == j:
                            roll1 += 0.5
                            roll2 += 0.5
                        if i < j:
                            roll2 += 1
                prob_roll1 = round(roll1/nb_issues*100,6)
                prob_roll2 = round(roll2/nb_issues*100,6)

                print(f"Move 1 : {prob_roll1}% to be used")
                print(f"Move 2 : {prob_roll2}% to be used")

            

                    
            
            def overlap3 (self, liste_roll):
                nb_issues = len(liste_roll[0]) * len(liste_roll[1]) * len(liste_roll[2])
                roll1 = 0
                roll2 = 0
                roll3 = 0
                for i in liste_roll[0] :
                    for j in liste_roll[1]:
                        for x in liste_roll[2]:
                            if i > j and i > x:
                                roll1 += 1
                            if i == j and i > x:
                                roll1 += 0.5
                                roll2 += 0.5
                            if i > j and i == x:
                                roll1 += 0.5
                                roll3 += 0.5
                            if j > i and j > x:
                                roll2 += 1
                            if x == j and j > i:
                                roll2 += 0.5
                                roll3 += 0.5
                            if x > j and x > i:
                                roll3 += 1
                            if x == i and i == j:
                                roll1 += 1/3
                                roll2 += 1/3
                                roll3 += 1/3
                                
                                
                prob_roll1 = round(roll1/nb_issues*100,6)
                prob_roll2 = round(roll2/nb_issues*100,6)
                prob_roll3 = round(roll3/nb_issues*100,6)
                print(f"Move 1 : {prob_roll1}% to be used")
                print(f"Move 2 : {prob_roll2}% to be used")
                print(f"Move 3 : {prob_roll3}% to be used")

            
            
            def overlap4 (self, liste_roll):
                nb_issues = len(liste_roll[0]) * len(liste_roll[1]) * len(liste_roll[2]) * len(liste_roll[3])
                roll1 = 0
                roll2 = 0
                roll3 = 0
                roll4 = 0
                for i in liste_roll[0] :
                    for j in liste_roll[1]:
                        for x in liste_roll[2]:
                            for y in liste_roll[3]:
                                if i > j and i > x and i > y:
                                    roll1 += 1
                                if i == j and i > x and i > y: 
                                    roll1 += 0.5
                                    roll2 += 0.5
                                if i > j and i == x and i > y:
                                    roll1 += 0.5
                                    roll3 += 0.5
                                if i > j and i > x and i == y:
                                    roll1 += 0.5
                                    roll4 += 0.5
                                if i == j and i == x and i > y:
                                    roll1 += 1/3
                                    roll2 += 1/3
                                    roll3 += 1/3
                                if i == j and i > x and i == y:
                                    roll1 += 1/3
                                    roll2 += 1/3
                                    roll4 += 1/3
                                if i > j and i == x and i == y:
                                    roll1 += 1/3
                                    roll3 += 1/3
                                    roll4 += 1/3
                                if j > i and j > x and j > y:
                                    roll2 += 1
                                if x == j and j > i and j > y:
                                    roll2 += 0.5
                                    roll3 += 0.5
                                if j > i and j > x and j == y:
                                    roll2 += 0.5
                                    roll4 += 0.5
                                if j > i and j == x and j == y:
                                    roll2 += 1/3
                                    roll3 += 1/3
                                    roll4 += 1/3  
                                if x > i and x > j and x > y:
                                    roll3 += 1
                                if x > i and x > j and x == y:
                                    roll3 += 0.5
                                    roll4 += 0.5
                                if y > i and y > j and y > x:
                                    roll4 += 1
                                if x == i and i == j and i == y:
                                    roll1 += 0.25
                                    roll2 += 0.25
                                    roll3 += 0.25
                                    roll4 += 0.25
                prob_roll1 = round(roll1/nb_issues*100,6)
                prob_roll2 = round(roll2/nb_issues*100,6)
                prob_roll3 = round(roll3/nb_issues*100,6)
                prob_roll4 = round(roll4/nb_issues*100,6)

                print(f"Move 1 : {prob_roll1}% to be used")
                print(f"Move 2 : {prob_roll2}% to be used")
                print(f"Move 3 : {prob_roll3}% to be used")
                print(f"Move 4 : {prob_roll4}% to be used")
                
                
            def overlap2_kill (self, liste_roll, HP):
                nb_issues = len(liste_roll[0]) * len(liste_roll[1])
                roll1 = 0
                roll2 = 0
                for i in liste_roll[0] :
                    for j in liste_roll[1]:
                        if i >= HP and j >= HP:
                            roll1 += 0.5
                            roll2 += 0.5
                        elif i>= HP and j < HP:
                            roll1 += 1
                        elif j>= HP and i < HP:
                            roll2 += 1
                        else:
                            if i > j:
                                roll1 += 1
                            if i == j:
                                roll1 += 0.5
                                roll2 += 0.5
                            if i < j:
                                roll2 += 1
                        
                prob_roll1 = round(roll1/nb_issues*100,6)
                prob_roll2 = round(roll2/nb_issues*100,6)

                print(f"Move 1 : {prob_roll1}% to be used")
                print(f"Move 2 : {prob_roll2}% to be used")

            
            def overlap3_kill (self, liste_roll, HP):
                nb_issues = len(liste_roll[0]) * len(liste_roll[1]) * len(liste_roll[2])
                roll1 = 0
                roll2 = 0
                roll3 = 0
                for i in liste_roll[0] :
                    for j in liste_roll[1]:
                        for x in liste_roll[2]:
                            if i >= HP and j >= HP and x >= HP:
                                roll1 += 1/3
                                roll2 += 1/3
                                roll3 += 1/3
                            elif i>= HP and j >= HP and x <HP:
                                roll1 += 0.5
                                roll2 += 0.5
                            elif i>= HP and j < HP and x >= HP:
                                roll1 += 0.5
                                roll3 += 0.5
                            elif i >= HP and j < HP and x <HP:
                                roll1 += 1
                            elif i < HP and j >= HP and x >= HP:
                                roll2 += 0.5
                                roll3 += 0.5
                            elif i < HP and j >= HP and x < HP:
                                roll2 += 1
                            elif i < HP and j < HP and x >= HP:
                                roll3 += 1
                            else:
                                if i > j and i > x:
                                    roll1 += 1
                                if i == j and i > x:
                                    roll1 += 0.5
                                    roll2 += 0.5
                                if i > j and i == x:
                                    roll1 += 0.5
                                    roll3 += 0.5
                                if j > i and j > x:
                                    roll2 += 1
                                if x == j and j > i:
                                    roll2 += 0.5
                                    roll3 += 0.5
                                if x > j and x > i:
                                    roll3 += 1
                                if x == i and i == j:
                                    roll1 += 1/3
                                    roll2 += 1/3
                                    roll3 += 1/3
                prob_roll1 = round(roll1/nb_issues*100,6)
                prob_roll2 = round(roll2/nb_issues*100,6)
                prob_roll3 = round(roll3/nb_issues*100,6)
                print(f"Move 1 : {prob_roll1}% to be used")
                print(f"Move 2 : {prob_roll2}% to be used")
                print(f"Move 3 : {prob_roll3}% to be used")


            def overlap4_kill (self, liste_roll,HP):
                nb_issues = len(liste_roll[0]) * len(liste_roll[1]) * len(liste_roll[2]) * len(liste_roll[3])
                roll1 = 0
                roll2 = 0
                roll3 = 0
                roll4 = 0
                for i in liste_roll[0] :
                    for j in liste_roll[1]:
                        for x in liste_roll[2]:
                            for y in liste_roll[3]:
                                if i >= HP and j >= HP and x >= HP and y >= HP:
                                    roll1 += 0.25
                                    roll2 += 0.25
                                    roll3 += 0.25
                                    roll4 += 0.25
                                elif i>= HP and j >= HP and x >= HP and y < HP:
                                    roll1 += 1/3
                                    roll2 += 1/3
                                    roll3 += 1/3
                                elif i>= HP and j >= HP and x < HP and y >= HP:
                                    roll1 += 1/3
                                    roll2 += 1/3
                                    roll4 += 1/3
                                elif i>= HP and j < HP and x >= HP and y >= HP:
                                    roll1 += 1/3
                                    roll3 += 1/3
                                    roll4 += 1/3  
                                elif i < HP and j >= HP and x >= HP and y >= HP:
                                    roll2 += 1/3
                                    roll3 += 1/3
                                    roll4 += 1/3      
                                elif i>= HP and j >= HP and x < HP and y < HP:
                                    roll1 += 0.5
                                    roll2 += 0.5                                    
                                elif i>= HP and j < HP and x >= HP and y < HP:
                                    roll1 += 0.5
                                    roll3 += 0.5    
                                elif i < HP and j >= HP and x >= HP and y < HP:
                                    roll2 += 0.5
                                    roll3 += 0.5      
                                elif i >= HP and j < HP and x < HP and y >= HP:
                                    roll1 += 0.5
                                    roll4 += 0.5  
                                elif i < HP and j >= HP and x < HP and y >= HP:
                                    roll2 += 0.5
                                    roll4 += 0.5  
                                elif i < HP and j < HP and x >= HP and y >= HP:
                                    roll3 += 0.5
                                    roll4 += 0.5 
                                elif i >= HP and j < HP and x < HP and y < HP:
                                    roll1 += 1
                                elif i < HP and j >= HP and x < HP and y < HP:
                                    roll2 += 1
                                elif i < HP and j < HP and x >= HP and y < HP:
                                    roll3 += 1                               
                                elif i < HP and j < HP and x < HP and y >= HP:
                                    roll4 += 1
                                else:
                                    if i > j and i > x and i > y:
                                        roll1 += 1
                                    if i == j and i > x and i > y: 
                                        roll1 += 0.5
                                        roll2 += 0.5
                                    if i > j and i == x and i > y:
                                        roll1 += 0.5
                                        roll3 += 0.5
                                    if i > j and i > x and i == y:
                                        roll1 += 0.5
                                        roll4 += 0.5
                                    if i == j and i == x and i > y:
                                        roll1 += 1/3
                                        roll2 += 1/3
                                        roll3 += 1/3
                                    if i == j and i > x and i == y:
                                        roll1 += 1/3
                                        roll2 += 1/3
                                        roll4 += 1/3
                                    if i > j and i == x and i == y:
                                        roll1 += 1/3
                                        roll3 += 1/3
                                        roll4 += 1/3
                                    if j > i and j > x and j > y:
                                        roll2 += 1
                                    if x == j and j > i and j > y:
                                        roll2 += 0.5
                                        roll3 += 0.5
                                    if j > i and j > x and j == y:
                                        roll2 += 0.5
                                        roll4 += 0.5
                                    if j > i and j == x and j == y:
                                        roll2 += 1/3
                                        roll3 += 1/3
                                        roll4 += 1/3  
                                    if x > i and x > j and x > y:
                                        roll3 += 1
                                    if x > i and x > j and x == y:
                                        roll3 += 0.5
                                        roll4 += 0.5
                                    if y > i and y > j and y > x:
                                        roll4 += 1
                                    if x == i and i == j and i == y:
                                        roll1 += 0.25
                                        roll2 += 0.25
                                        roll3 += 0.25
                                        roll4 += 0.25                
                prob_roll1 = round(roll1/nb_issues*100,6)
                prob_roll2 = round(roll2/nb_issues*100,6)
                prob_roll3 = round(roll3/nb_issues*100,6)
                prob_roll4 = round(roll4/nb_issues*100,6)

                print(f"Move 1 : {prob_roll1}% to be used")
                print(f"Move 2 : {prob_roll2}% to be used")
                print(f"Move 3 : {prob_roll3}% to be used")
                print(f"Move 4 : {prob_roll4}% to be used")




                    
        if __name__ == "__main__":
            app = Data()
            app.mainloop()
        
if __name__ == "__main__":
    app = Data()
    app.mainloop()