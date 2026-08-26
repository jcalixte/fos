# Field of Strategy III — Design (QFD)

How the game's player-facing goals cascade into things the system must do, what gets built to
do them, and what was traded away. Vocabulary is owned by [CONTEXT.md](./CONTEXT.md) and is used
here verbatim — this document names Goals, Functions and Components but never redefines a term.
Hard-to-reverse decisions live in [docs/adr/](./docs/adr/); this is the index that shows where
they sit in the cascade.

Scope is a single battle. Campaign persistence, multiplayer and anything above the Unit are out.

**Decisions are cross-checked against two nominal battles, both from the first Italian campaign.**
**Castiglione (5 Aug 1796)** is the everyday case — open rolling ground, all three Arms manoeuvring
in Formation, one Arrival, one piece of Key Ground. **Rivoli (14 Jan 1797)** is the ceiling — the
Field at its size limit, 200m of relief, impassability by gradient, a Crossing formed by a gorge,
several Arrivals. Mechanics the campaign under-exercises — cavalry catching infantry unformed,
above all — are checked against purpose-built fixtures instead, because testing a mechanic by
hoping a historical battle happens to contain it is testing by coincidence.

Strength weights used in matrices: **9** strong, **3** medium, **1** weak, blank none.

---

## House of Quality

The same data as §§1–2, §5 and §6, in one picture: goals and their weights down the left, the twenty functions across the top, the relation matrix in the body, the function-versus-function correlations in the roof, and the derived engineering priorities in the basement. The **relative weight** row is where the effort should go.

```tikz
\usetikzlibrary{arrows.meta, positioning, shapes.geometric, shapes.misc, calc, fit, backgrounds}

\newif\ifqfdshowroof          \qfdshowrooftrue
\newif\ifqfdshowbasement      \qfdshowbasementtrue
\newif\ifqfdshowcompetitive   \qfdshowcompetitivetrue
\newif\ifqfdshowlegend        \qfdshowlegendtrue
\newif\ifqfdshowimportance    \qfdshowimportancetrue
\newif\ifqfdshowcorrlegend    \qfdshowcorrlegendtrue
\newif\ifqfdshowevallegend    \qfdshowevallegendtrue
\newif\ifqfdshowtitle         \qfdshowtitletrue

\def\qfdNW{5}
\def\qfdNH{5}
\def\qfdWhatW{4.0}
\def\qfdImpW{0.9}
\def\qfdCmpW{3}
\def\qfdHdrH{2.6}
\def\qfdBasementN{4}

\def\qfdWhatsTitle{Customer needs}
\def\qfdImpTitle{Imp.\ \%}
\def\qfdPerceptionTitle{Comparative evaluation}
\def\qfdPoorLabel{poor}
\def\qfdExcellentLabel{excellent}
\def\qfdAltOneLabel{Our product}
\def\qfdAltTwoLabel{Competitor A}
\def\qfdAltThreeLabel{Competitor B}
\def\qfdRelTitle{Relation}
\def\qfdCorrTitle{Correlation}
\def\qfdEvalTitle{Evaluation}
\def\qfdProjectTitle{}
\def\qfdConcept{}

\tikzset{
  qfdthin/.style ={line width=0.35pt},
  qfdmed/.style  ={line width=0.7pt},
  qfdstrong/.style={circle, draw, fill=black,
                    minimum size=7pt, inner sep=0pt},
  qfdmod/.style  ={circle, draw,
                    minimum size=7pt, inner sep=0pt, line width=0.8pt},
  qfdweak/.style ={regular polygon, regular polygon sides=3, draw,
                    minimum size=8.5pt, inner sep=0pt, line width=0.7pt},
  qfdrel/.is choice,
  qfdrel/S/.style={qfdstrong},
  qfdrel/M/.style={qfdmod},
  qfdrel/W/.style={qfdweak},
  qfdalt1mk/.style={circle, draw, fill=black,
                    minimum size=6pt, inner sep=0pt, line width=1pt},
  qfdalt1ln/.style={line width=1.2pt},
  qfdalt2mk/.style={regular polygon, regular polygon sides=3, draw,
                    fill=black, minimum size=6pt, inner sep=0pt,
                    line width=0.7pt},
  qfdalt2ln/.style={line width=0.7pt, dashed},
  qfdalt3mk/.style={rectangle, draw, fill=black,
                    minimum size=5pt, inner sep=0pt, line width=0.7pt},
  qfdalt3ln/.style={line width=0.7pt, dotted},
}

\newcommand{\qfdDrawGrid}{%
  \foreach \c in {1,...,\qfdNHm} \draw[qfdthin] (\c, 0) -- (\c, -\qfdNW);
  \foreach \r in {1,...,\qfdNWm} \draw[qfdthin] (0, -\r) -- (\qfdNH, -\r);
  \foreach \r in {1,...,\qfdNWm}
    \draw[qfdthin] (\qfdLeftEdge, -\r) -- (0, -\r);
  \ifqfdshowroof
    \foreach \c in {1,...,\qfdNHm}
      \draw[qfdthin] (\c, 0) -- (\c, \qfdHdrH);
  \fi
  \ifqfdshowcompetitive
    \foreach \r in {1,...,\qfdNWm}
      \draw[qfdthin] (\qfdNH, -\r) -- (\qfdNH+\qfdCmpW, -\r);
  \fi
  \ifqfdshowbasement
    \foreach \r in {1,...,\qfdBasementN}
      \draw[qfdthin] (0, -\qfdNW-\r) -- (\qfdNH, -\qfdNW-\r);
    \foreach \c in {1,...,\qfdNHm}
      \draw[qfdthin] (\c, -\qfdNW) -- (\c, -\qfdNW-\qfdBasementN);
  \fi
}

\newcommand{\qfdDrawRoof}{%
  \ifqfdshowroof
    \foreach \k in {1,...,\qfdNHm} {%
      \pgfmathsetmacro{\rx}{(\k+\qfdNH)/2}
      \pgfmathsetmacro{\ry}{\qfdHdrH + (\qfdNH-\k)/2}
      \pgfmathsetmacro{\lx}{\k/2}
      \pgfmathsetmacro{\ly}{\qfdHdrH + \k/2}
      \draw[qfdthin] (\k, \qfdHdrH) -- (\rx, \ry);
      \draw[qfdthin] (\k, \qfdHdrH) -- (\lx, \ly);
    }%
    \draw[qfdmed] (0, \qfdHdrH)
       -- (\qfdNH/2, \qfdApexY) -- (\qfdNH, \qfdHdrH);
    \foreach \i in {1,...,\qfdNH}
      \foreach \k in {1,...,\qfdNH} {%
        \pgfmathtruncatemacro{\jj}{\i+\k}
        \ifnum\jj>\qfdNH\relax\else
          \pgfmathsetmacro{\xx}{\i + \k/2 - 0.5}
          \pgfmathsetmacro{\yy}{\qfdHdrH + \k/2}
          \coordinate (C-\i-\jj) at (\xx, \yy);
        \fi
      }%
  \fi
}

\newcommand{\qfdDrawScale}{%
  \ifqfdshowcompetitive
    \foreach \tk in {0,1,2,3,4,5} {%
      \pgfmathsetmacro{\tx}{\qfdNH + (\tk+0.5)*\qfdCmpW/6}
      \node[anchor=south, font=\scriptsize] at (\tx, 0.02) {\tk};
    }%
    \node[anchor=south, font=\scriptsize\bfseries, align=center]
         at ({\qfdNH + \qfdCmpW/2}, 0.7) {\qfdPerceptionTitle};
    \node[anchor=north, font=\scriptsize\itshape]
         at ({\qfdNH + 0.45}, -\qfdNW) {\qfdPoorLabel};
    \node[anchor=north, font=\scriptsize\itshape]
         at ({\qfdNH + \qfdCmpW - 0.45}, -\qfdNW) {\qfdExcellentLabel};
  \fi
}

\newcommand{\qfdDrawZoneTitles}{%
  \ifqfdshowimportance
    \node[rotate=90, anchor=west, font=\footnotesize\bfseries]
         at ({-\qfdImpW/2}, 0.12) {\qfdImpTitle};
  \fi
  \node[font=\scriptsize\bfseries, align=center, text width=\qfdWhatW cm]
       at ({\qfdLeftEdge + \qfdWhatW/2},
           {\ifqfdshowroof \qfdHdrH/2 \else 0.6 \fi}) {\qfdWhatsTitle};
}

\newcommand{\qfdDrawTitle}{%
  \ifqfdshowtitle
    \ifx\qfdProjectTitle\empty\else
      \pgfmathsetmacro{\qfdTitleX}{\qfdNH/2}
      \pgfmathsetmacro{\qfdTitleY}{\ifqfdshowroof \qfdApexY \else \qfdHdrH \fi + 0.9}
      \pgfmathsetmacro{\qfdSubW}{\qfdNH + 2}
      \node[anchor=south, font=\large\bfseries, align=center]
           at (\qfdTitleX, \qfdTitleY) {\qfdProjectTitle};
      \ifx\qfdConcept\empty\else
        \node[anchor=north, font=\footnotesize\itshape, align=center,
              text width=\qfdSubW cm]
             at (\qfdTitleX, {\qfdTitleY - 0.1}) {\qfdConcept};
      \fi
    \fi
  \fi
}

\newcommand{\qfdDrawFrames}{%
  \begin{scope}[qfdmed]
    \draw (\qfdLeftEdge, 0) rectangle (\qfdNH, -\qfdNW);
    \ifqfdshowimportance \draw (-\qfdImpW, 0) -- (-\qfdImpW, -\qfdNW); \fi
    \draw (0, 0) -- (0, -\qfdNW);
    \ifqfdshowroof
      \draw (0, 0) rectangle (\qfdNH, \qfdHdrH); \fi
    \ifqfdshowbasement
      \draw (0, -\qfdNW) rectangle (\qfdNH, -\qfdNW-\qfdBasementN); \fi
    \ifqfdshowcompetitive
      \draw (\qfdNH, 0) rectangle (\qfdNH+\qfdCmpW, -\qfdNW); \fi
  \end{scope}
}

\newcommand{\qfdDrawLegend}{%
  \ifqfdshowlegend
    \pgfmathsetmacro{\qfdLegX}{%
      \qfdNH + \ifqfdshowcompetitive \qfdCmpW + 0.7 \else 0.7 \fi}
    \pgfmathsetmacro{\qfdLegBottom}{%
      -2.05
      \ifqfdshowroof    \ifqfdshowcorrlegend - 2.55 \fi \fi
      \ifqfdshowcompetitive \ifqfdshowevallegend - 2.20 \fi \fi}
    \pgfmathsetmacro{\qfdLegY}{\qfdHdrH - 0.4}
    \begin{scope}[shift={(\qfdLegX, \qfdLegY)}]
      \draw[qfdmed, rounded corners=2pt]
        (-0.15, 0.4) rectangle (4.5, \qfdLegBottom);
      \node[anchor=west, font=\footnotesize\bfseries] at (0, 0.1)
        {\qfdRelTitle};
      \draw[qfdthin] (0, -0.15) -- (4.35, -0.15);
      \node[qfdstrong] at (0.22, -0.5)  {};
        \node[anchor=west] at (0.5, -0.5)  {Strong (9)};
      \node[qfdmod]    at (0.22, -0.95) {};
        \node[anchor=west] at (0.5, -0.95) {Medium (3)};
      \node[qfdweak]   at (0.22, -1.4)  {};
        \node[anchor=west] at (0.5, -1.4)  {Weak (1)};
      \ifqfdshowroof \ifqfdshowcorrlegend
        \node[anchor=west, font=\footnotesize\bfseries] at (0, -2.10)
          {\qfdCorrTitle};
        \draw[qfdthin] (0, -2.35) -- (4.35, -2.35);
        \node[anchor=west] at (0, -2.70) {{$+\!+$}\quad very positive};
        \node[anchor=west] at (0, -3.05) {{$+$\phantom{$+$}}\quad positive};
        \node[anchor=west] at (0, -3.40) {{$-$\phantom{$-$}}\quad negative};
        \node[anchor=west] at (0, -3.75) {{$-\!-$}\quad very negative};
      \fi \fi
      \ifqfdshowcompetitive \ifqfdshowevallegend
        \pgfmathsetmacro{\qfdEvalTop}{%
          -2.10 \ifqfdshowroof\ifqfdshowcorrlegend - 2.55 \fi\fi}
        \node[anchor=west, font=\footnotesize\bfseries]
          at (0, \qfdEvalTop) {\qfdEvalTitle};
        \pgfmathsetmacro{\qfdEvalSep}{\qfdEvalTop - 0.25}
        \draw[qfdthin] (0, \qfdEvalSep) -- (4.35, \qfdEvalSep);
        \pgfmathsetmacro{\qfdLegA}{\qfdEvalTop - 0.55}
        \draw[qfdalt1ln] (0.05, \qfdLegA) -- (0.45, \qfdLegA);
          \node[qfdalt1mk] at (0.25, \qfdLegA) {};
          \node[anchor=west, font=\bfseries] at (0.55, \qfdLegA)
            {\qfdAltOneLabel};
        \pgfmathsetmacro{\qfdLegB}{\qfdEvalTop - 0.95}
        \draw[qfdalt2ln] (0.05, \qfdLegB) -- (0.45, \qfdLegB);
          \node[qfdalt2mk] at (0.25, \qfdLegB) {};
          \node[anchor=west] at (0.55, \qfdLegB) {\qfdAltTwoLabel};
        \pgfmathsetmacro{\qfdLegC}{\qfdEvalTop - 1.35}
        \draw[qfdalt3ln] (0.05, \qfdLegC) -- (0.45, \qfdLegC);
          \node[qfdalt3mk] at (0.25, \qfdLegC) {};
          \node[anchor=west] at (0.55, \qfdLegC) {\qfdAltThreeLabel};
      \fi \fi
    \end{scope}
  \fi
}

\newenvironment{qfdhouse}{%
  \begin{tikzpicture}[x=1cm, y=1cm, font=\scriptsize,
                      line cap=round, line join=round]
  \ifqfdshowimportance
    \pgfmathsetmacro{\qfdLeftEdge}{-\qfdWhatW-\qfdImpW}
  \else
    \pgfmathsetmacro{\qfdLeftEdge}{-\qfdWhatW}
  \fi
  \pgfmathsetmacro{\qfdApexY}{\qfdHdrH + \qfdNH/2}
  \pgfmathtruncatemacro{\qfdNHm}{\qfdNH - 1}
  \pgfmathtruncatemacro{\qfdNWm}{\qfdNW - 1}
  \qfdDrawGrid
  \qfdDrawRoof
  \qfdDrawScale
  \qfdDrawZoneTitles
  \qfdDrawTitle
}{%
  \qfdDrawFrames
  \qfdDrawLegend
  \end{tikzpicture}%
}

\def\qfdNW{7}
\def\qfdNH{20}
\def\qfdWhatW{4.4}
\def\qfdHdrH{3.7}
\def\qfdImpTitle{Weight}
\def\qfdWhatsTitle{Player goals \textemdash{} the WHATs}
\qfdshowcompetitivefalse
\def\qfdProjectTitle{Field of Strategy III}
\def\qfdConcept{Real-time \textbf{Napoleonic} battles in which an \textbf{Order} is a \textbf{Courier} who has to ride there, a \textbf{Unit} looks after itself until he arrives, and the tactics of the period fall out of \textbf{geometry} rather than rules.}

\begin{document}
\begin{qfdhouse}

  % --- WHATs and weights ---
  \pgfmathsetmacro{\qfdWhatTextW}{\qfdWhatW - 0.2}
  \node[anchor=west, font=\scriptsize, text width=\qfdWhatTextW cm, align=left]
    at ({\qfdLeftEdge + 0.1}, {-1 + 0.5}) {Commander, not puppeteer};
  \node[anchor=west, font=\scriptsize, text width=\qfdWhatTextW cm, align=left]
    at ({\qfdLeftEdge + 0.1}, {-2 + 0.5}) {Reads at a glance};
  \node[anchor=west, font=\scriptsize, text width=\qfdWhatTextW cm, align=left]
    at ({\qfdLeftEdge + 0.1}, {-3 + 0.5}) {Period tactics win};
  \node[anchor=west, font=\scriptsize, text width=\qfdWhatTextW cm, align=left]
    at ({\qfdLeftEdge + 0.1}, {-4 + 0.5}) {A battle has shape};
  \node[anchor=west, font=\scriptsize, text width=\qfdWhatTextW cm, align=left]
    at ({\qfdLeftEdge + 0.1}, {-5 + 0.5}) {Authorable as data};
  \node[anchor=west, font=\scriptsize, text width=\qfdWhatTextW cm, align=left]
    at ({\qfdLeftEdge + 0.1}, {-6 + 0.5}) {A link you can hand over};
  \node[anchor=west, font=\scriptsize, text width=\qfdWhatTextW cm, align=left]
    at ({\qfdLeftEdge + 0.1}, {-7 + 0.5}) {Good to watch};
  \node[font=\scriptsize] at ({-\qfdImpW/2}, {-1 + 0.5}) {10};
  \node[font=\scriptsize] at ({-\qfdImpW/2}, {-2 + 0.5}) {9};
  \node[font=\scriptsize] at ({-\qfdImpW/2}, {-3 + 0.5}) {9};
  \node[font=\scriptsize] at ({-\qfdImpW/2}, {-4 + 0.5}) {8};
  \node[font=\scriptsize] at ({-\qfdImpW/2}, {-5 + 0.5}) {7};
  \node[font=\scriptsize] at ({-\qfdImpW/2}, {-6 + 0.5}) {5};
  \node[font=\scriptsize] at ({-\qfdImpW/2}, {-7 + 0.5}) {8};

  % --- HOWs ---
  \node[rotate=90, anchor=west, font=\scriptsize] at ({1 - 0.5}, 0.15) {F1~Order on courier time};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({2 - 0.5}, 0.15) {F2~Pending Orders shown};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({3 - 0.5}, 0.15) {F3~Initiative};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({4 - 0.5}, 0.15) {F4~Routing};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({5 - 0.5}, 0.15) {F5~Silhouette read};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({6 - 0.5}, 0.15) {F6~Field on one screen};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({7 - 0.5}, 0.15) {F7~Dispatches with cause};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({8 - 0.5}, 0.15) {F8~Effects from geometry};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({9 - 0.5}, 0.15) {F9~Discrete fire events};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({10 - 0.5}, 0.15) {F10~Morale decides};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({11 - 0.5}, 0.15) {F11~Break or clock ends it};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({12 - 0.5}, 0.15) {F12~Formation morph};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({13 - 0.5}, 0.15) {F13~Flash and smoke};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({14 - 0.5}, 0.15) {F14~Render interpolation};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({15 - 0.5}, 0.15) {F15~Sound per event};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({16 - 0.5}, 0.15) {F16~Scenario from data};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({17 - 0.5}, 0.15) {F17~Terrain painted};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({18 - 0.5}, 0.15) {F18~Identical replay};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({19 - 0.5}, 0.15) {F19~Static build};
  \node[rotate=90, anchor=west, font=\scriptsize] at ({20 - 0.5}, 0.15) {F20~Arrival};

  % --- Relations ---
  \node[qfdrel/S] at ({1 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/S] at ({2 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/S] at ({3 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/M] at ({4 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/W] at ({5 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/M] at ({6 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/M] at ({7 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/W] at ({9 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/W] at ({10 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/W] at ({12 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/W] at ({13 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/W] at ({15 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/W] at ({20 - 0.5}, {-1 + 0.5}) {};
  \node[qfdrel/S] at ({2 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/W] at ({3 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/S] at ({5 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/S] at ({6 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/S] at ({7 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/M] at ({8 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/M] at ({9 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/W] at ({10 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/M] at ({12 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/S] at ({13 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/M] at ({14 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/M] at ({15 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/W] at ({20 - 0.5}, {-2 + 0.5}) {};
  \node[qfdrel/M] at ({1 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/S] at ({3 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/M] at ({4 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/M] at ({7 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/S] at ({8 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/S] at ({9 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/S] at ({10 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/M] at ({11 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/W] at ({12 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/M] at ({16 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/M] at ({17 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/S] at ({18 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/M] at ({20 - 0.5}, {-3 + 0.5}) {};
  \node[qfdrel/M] at ({1 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/M] at ({3 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/W] at ({4 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/W] at ({6 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/M] at ({7 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/M] at ({9 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/S] at ({10 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/S] at ({11 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/M] at ({15 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/M] at ({16 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/S] at ({20 - 0.5}, {-4 + 0.5}) {};
  \node[qfdrel/M] at ({3 - 0.5}, {-5 + 0.5}) {};
  \node[qfdrel/W] at ({6 - 0.5}, {-5 + 0.5}) {};
  \node[qfdrel/W] at ({7 - 0.5}, {-5 + 0.5}) {};
  \node[qfdrel/W] at ({8 - 0.5}, {-5 + 0.5}) {};
  \node[qfdrel/M] at ({11 - 0.5}, {-5 + 0.5}) {};
  \node[qfdrel/S] at ({16 - 0.5}, {-5 + 0.5}) {};
  \node[qfdrel/S] at ({17 - 0.5}, {-5 + 0.5}) {};
  \node[qfdrel/M] at ({18 - 0.5}, {-5 + 0.5}) {};
  \node[qfdrel/W] at ({19 - 0.5}, {-5 + 0.5}) {};
  \node[qfdrel/S] at ({20 - 0.5}, {-5 + 0.5}) {};
  \node[qfdrel/W] at ({6 - 0.5}, {-6 + 0.5}) {};
  \node[qfdrel/W] at ({16 - 0.5}, {-6 + 0.5}) {};
  \node[qfdrel/S] at ({19 - 0.5}, {-6 + 0.5}) {};
  \node[qfdrel/W] at ({1 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/M] at ({2 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/W] at ({3 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/W] at ({4 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/M] at ({5 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/M] at ({6 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/W] at ({7 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/M] at ({9 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/S] at ({12 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/S] at ({13 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/S] at ({14 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/S] at ({15 - 0.5}, {-7 + 0.5}) {};
  \node[qfdrel/W] at ({20 - 0.5}, {-7 + 0.5}) {};

  % --- Roof correlations ---
  \node[font=\tiny] at (C-1-2) {$+\!+$};
  \node[font=\tiny] at (C-1-3) {$+\!+$};
  \node[font=\tiny] at (C-1-11) {$-$};
  \node[font=\tiny] at (C-1-15) {$+$};
  \node[font=\tiny] at (C-2-3) {$+$};
  \node[font=\tiny] at (C-2-11) {$+$};
  \node[font=\tiny] at (C-2-13) {$-$};
  \node[font=\tiny] at (C-3-7) {$+\!+$};
  \node[font=\tiny] at (C-3-11) {$+$};
  \node[font=\tiny] at (C-4-20) {$+$};
  \node[font=\tiny] at (C-5-6) {$-$};
  \node[font=\tiny] at (C-5-12) {$+\!+$};
  \node[font=\tiny] at (C-5-13) {$-$};
  \node[font=\tiny] at (C-6-13) {$-$};
  \node[font=\tiny] at (C-6-14) {$+$};
  \node[font=\tiny] at (C-7-8) {$-$};
  \node[font=\tiny] at (C-8-9) {$+\!+$};
  \node[font=\tiny] at (C-8-10) {$-$};
  \node[font=\tiny] at (C-8-11) {$-$};
  \node[font=\tiny] at (C-8-18) {$+\!+$};
  \node[font=\tiny] at (C-9-13) {$+\!+$};
  \node[font=\tiny] at (C-9-15) {$+\!+$};
  \node[font=\tiny] at (C-10-11) {$+\!+$};
  \node[font=\tiny] at (C-11-20) {$-$};
  \node[font=\tiny] at (C-12-14) {$+\!+$};
  \node[font=\tiny] at (C-13-14) {$+$};
  \node[font=\tiny] at (C-14-18) {$-$};
  \node[font=\tiny] at (C-16-17) {$+\!+$};
  \node[font=\tiny] at (C-16-20) {$+\!+$};
  \node[font=\tiny] at (C-17-18) {$+$};

  % --- Basement: target / difficulty / absolute / relative %% ---
  \node[font=\tiny] at ({1 - 0.5}, {-\qfdNW - 0.5}) {13 m/s};
  \node[font=\tiny] at ({1 - 0.5}, {-\qfdNW - 1.5}) {2};
  \node[font=\tiny] at ({1 - 0.5}, {-\qfdNW - 2.5}) {149};
  \node[font=\tiny\bfseries] at ({1 - 0.5}, {-\qfdNW - 3.5}) {5.4};
  \node[font=\tiny] at ({2 - 0.5}, {-\qfdNW - 0.5}) {100\%};
  \node[font=\tiny] at ({2 - 0.5}, {-\qfdNW - 1.5}) {2};
  \node[font=\tiny] at ({2 - 0.5}, {-\qfdNW - 2.5}) {195};
  \node[font=\tiny\bfseries] at ({2 - 0.5}, {-\qfdNW - 3.5}) {7.1};
  \node[font=\tiny] at ({3 - 0.5}, {-\qfdNW - 0.5}) {never idle};
  \node[font=\tiny] at ({3 - 0.5}, {-\qfdNW - 1.5}) {4};
  \node[font=\tiny] at ({3 - 0.5}, {-\qfdNW - 2.5}) {233};
  \node[font=\tiny\bfseries] at ({3 - 0.5}, {-\qfdNW - 3.5}) {8.5};
  \node[font=\tiny] at ({4 - 0.5}, {-\qfdNW - 0.5}) {$<$5 ms};
  \node[font=\tiny] at ({4 - 0.5}, {-\qfdNW - 1.5}) {3};
  \node[font=\tiny] at ({4 - 0.5}, {-\qfdNW - 2.5}) {73};
  \node[font=\tiny\bfseries] at ({4 - 0.5}, {-\qfdNW - 3.5}) {2.7};
  \node[font=\tiny] at ({5 - 0.5}, {-\qfdNW - 0.5}) {4 distinct};
  \node[font=\tiny] at ({5 - 0.5}, {-\qfdNW - 1.5}) {3};
  \node[font=\tiny] at ({5 - 0.5}, {-\qfdNW - 2.5}) {115};
  \node[font=\tiny\bfseries] at ({5 - 0.5}, {-\qfdNW - 3.5}) {4.2};
  \node[font=\tiny] at ({6 - 0.5}, {-\qfdNW - 0.5}) {1920 m};
  \node[font=\tiny] at ({6 - 0.5}, {-\qfdNW - 1.5}) {1};
  \node[font=\tiny] at ({6 - 0.5}, {-\qfdNW - 2.5}) {155};
  \node[font=\tiny\bfseries] at ({6 - 0.5}, {-\qfdNW - 3.5}) {5.7};
  \node[font=\tiny] at ({7 - 0.5}, {-\qfdNW - 0.5}) {every event};
  \node[font=\tiny] at ({7 - 0.5}, {-\qfdNW - 1.5}) {2};
  \node[font=\tiny] at ({7 - 0.5}, {-\qfdNW - 2.5}) {177};
  \node[font=\tiny\bfseries] at ({7 - 0.5}, {-\qfdNW - 3.5}) {6.5};
  \node[font=\tiny] at ({8 - 0.5}, {-\qfdNW - 0.5}) {0 constants};
  \node[font=\tiny] at ({8 - 0.5}, {-\qfdNW - 1.5}) {4};
  \node[font=\tiny] at ({8 - 0.5}, {-\qfdNW - 2.5}) {115};
  \node[font=\tiny\bfseries] at ({8 - 0.5}, {-\qfdNW - 3.5}) {4.2};
  \node[font=\tiny] at ({9 - 0.5}, {-\qfdNW - 0.5}) {20--25 s};
  \node[font=\tiny] at ({9 - 0.5}, {-\qfdNW - 1.5}) {3};
  \node[font=\tiny] at ({9 - 0.5}, {-\qfdNW - 2.5}) {166};
  \node[font=\tiny\bfseries] at ({9 - 0.5}, {-\qfdNW - 3.5}) {6.1};
  \node[font=\tiny] at ({10 - 0.5}, {-\qfdNW - 0.5}) {15--30\%};
  \node[font=\tiny] at ({10 - 0.5}, {-\qfdNW - 1.5}) {5};
  \node[font=\tiny] at ({10 - 0.5}, {-\qfdNW - 2.5}) {172};
  \node[font=\tiny\bfseries] at ({10 - 0.5}, {-\qfdNW - 3.5}) {6.3};
  \node[font=\tiny] at ({11 - 0.5}, {-\qfdNW - 0.5}) {20--40 min};
  \node[font=\tiny] at ({11 - 0.5}, {-\qfdNW - 1.5}) {3};
  \node[font=\tiny] at ({11 - 0.5}, {-\qfdNW - 2.5}) {120};
  \node[font=\tiny\bfseries] at ({11 - 0.5}, {-\qfdNW - 3.5}) {4.4};
  \node[font=\tiny] at ({12 - 0.5}, {-\qfdNW - 0.5}) {no pop};
  \node[font=\tiny] at ({12 - 0.5}, {-\qfdNW - 1.5}) {4};
  \node[font=\tiny] at ({12 - 0.5}, {-\qfdNW - 2.5}) {118};
  \node[font=\tiny\bfseries] at ({12 - 0.5}, {-\qfdNW - 3.5}) {4.3};
  \node[font=\tiny] at ({13 - 0.5}, {-\qfdNW - 0.5}) {1/Volley};
  \node[font=\tiny] at ({13 - 0.5}, {-\qfdNW - 1.5}) {2};
  \node[font=\tiny] at ({13 - 0.5}, {-\qfdNW - 2.5}) {163};
  \node[font=\tiny\bfseries] at ({13 - 0.5}, {-\qfdNW - 3.5}) {6.0};
  \node[font=\tiny] at ({14 - 0.5}, {-\qfdNW - 0.5}) {10/60 Hz};
  \node[font=\tiny] at ({14 - 0.5}, {-\qfdNW - 1.5}) {2};
  \node[font=\tiny] at ({14 - 0.5}, {-\qfdNW - 2.5}) {99};
  \node[font=\tiny\bfseries] at ({14 - 0.5}, {-\qfdNW - 3.5}) {3.6};
  \node[font=\tiny] at ({15 - 0.5}, {-\qfdNW - 0.5}) {6 events};
  \node[font=\tiny] at ({15 - 0.5}, {-\qfdNW - 1.5}) {2};
  \node[font=\tiny] at ({15 - 0.5}, {-\qfdNW - 2.5}) {133};
  \node[font=\tiny\bfseries] at ({15 - 0.5}, {-\qfdNW - 3.5}) {4.9};
  \node[font=\tiny] at ({16 - 0.5}, {-\qfdNW - 0.5}) {0 code};
  \node[font=\tiny] at ({16 - 0.5}, {-\qfdNW - 1.5}) {2};
  \node[font=\tiny] at ({16 - 0.5}, {-\qfdNW - 2.5}) {119};
  \node[font=\tiny\bfseries] at ({16 - 0.5}, {-\qfdNW - 3.5}) {4.4};
  \node[font=\tiny] at ({17 - 0.5}, {-\qfdNW - 0.5}) {$<$1 h};
  \node[font=\tiny] at ({17 - 0.5}, {-\qfdNW - 1.5}) {3};
  \node[font=\tiny] at ({17 - 0.5}, {-\qfdNW - 2.5}) {90};
  \node[font=\tiny\bfseries] at ({17 - 0.5}, {-\qfdNW - 3.5}) {3.3};
  \node[font=\tiny] at ({18 - 0.5}, {-\qfdNW - 0.5}) {bit-exact};
  \node[font=\tiny] at ({18 - 0.5}, {-\qfdNW - 1.5}) {3};
  \node[font=\tiny] at ({18 - 0.5}, {-\qfdNW - 2.5}) {102};
  \node[font=\tiny\bfseries] at ({18 - 0.5}, {-\qfdNW - 3.5}) {3.7};
  \node[font=\tiny] at ({19 - 0.5}, {-\qfdNW - 0.5}) {no server};
  \node[font=\tiny] at ({19 - 0.5}, {-\qfdNW - 1.5}) {1};
  \node[font=\tiny] at ({19 - 0.5}, {-\qfdNW - 2.5}) {52};
  \node[font=\tiny\bfseries] at ({19 - 0.5}, {-\qfdNW - 3.5}) {1.9};
  \node[font=\tiny] at ({20 - 0.5}, {-\qfdNW - 0.5}) {clock/trig};
  \node[font=\tiny] at ({20 - 0.5}, {-\qfdNW - 1.5}) {3};
  \node[font=\tiny] at ({20 - 0.5}, {-\qfdNW - 2.5}) {189};
  \node[font=\tiny\bfseries] at ({20 - 0.5}, {-\qfdNW - 3.5}) {6.9};

  % --- Basement row labels ---
  \node[anchor=east, font=\scriptsize\bfseries] at (-0.15, {-\qfdNW - 0.5}) {Target};
  \node[anchor=east, font=\scriptsize\bfseries] at (-0.15, {-\qfdNW - 1.5}) {Difficulty (1--5)};
  \node[anchor=east, font=\scriptsize\bfseries] at (-0.15, {-\qfdNW - 2.5}) {Absolute weight};
  \node[anchor=east, font=\scriptsize\bfseries] at (-0.15, {-\qfdNW - 3.5}) {Relative weight \%};

\end{qfdhouse}
\end{document}
```

---

## 1. Goals — the WHATs

The player is someone who finds the period interesting and wants the game that doesn't exist —
essentially the author. Onboarding and teaching the period are deliberately not goals: the
player already knows what a square is for.

| ID  | Goal                                                                                  | Weight | Source |
|-----|---------------------------------------------------------------------------------------|:------:|--------|
| G1  | You feel like a commander, not a puppeteer — you issue intent and watch it play out imperfectly | 10 | [ADR-0002](./docs/adr/0002-orders-are-couriered-from-a-headquarters.md) |
| G2  | The battlefield reads at a glance — silhouette and colour say what everything is doing, with no labels or menus | 9 | design session |
| G3  | Napoleonic tactics are the winning tactics — what worked in 1796 works here, what didn't, doesn't | 9 | [CONTEXT.md](./CONTEXT.md) |
| G4  | A battle has a shape — deployment, approach, crisis, collapse — inside 20–40 minutes    |   8    | design session |
| G5  | Scenarios are authorable as data, without touching code                                |   7    | [ADR-0003](./docs/adr/0003-typescript-with-a-pure-simulation-core.md) |
| G6  | It's a link you can hand someone                                                       |   5    | [ADR-0003](./docs/adr/0003-typescript-with-a-pure-simulation-core.md) |
| G7  | The battle is good to watch — everything moves continuously, changes happen visibly, and fire reads | 8 | design session |

## 2. Functions — the HOWs

**Command** — serves G1

| ID  | Function                                    | Dir | Target |
|-----|---------------------------------------------|:---:|--------|
| F1  | Deliver an Order on courier time            |  →  | courier 13 m/s: 200m ≈ 15s, 1500m ≈ 115s |
| F2  | Show every pending Order on the Field       |  →  | 100% drawn as Courier + Ghost; zero hidden timers |
| F3  | Cover the gaps with Initiative              |  ↑  | never idle under threat — return fire, form square, Break, Rout, Rally, pick travelling Formation |
| F4  | Route a Unit to any reachable point         |  →  | funnels to Crossings; no manual waypointing required; pathfind under 5ms on 250×250 |

**Legibility** — serves G2

| ID  | Function                                    | Dir | Target |
|-----|---------------------------------------------|:---:|--------|
| F5  | Keep Formation readable from silhouette alone |  →  | 4 infantry silhouettes distinct at 1 px/m; Figure ≥ 3px |
| F6  | Hold the whole Field on one screen          |  →  | ≤1920m across, no camera controls |
| F7  | Report every consequential event as a Dispatch, with its cause |  ↑  | every Break, Rout, Rally, Charge outcome and Order arrival, each naming why |

**Fidelity** — serves G3

| ID  | Function                                    | Dir | Target |
|-----|---------------------------------------------|:---:|--------|
| F8  | Derive combat effect from geometry, not per-Formation constants |  ↑  | zero hard-coded Formation bonuses |
| F9  | Resolve fighting as discrete events on historical clocks |  →  | Volley 20–25s, gun 30–60s, Contact ≤30s |
| F10 | Let Morale decide a Unit's fate, not Strength |  →  | Break at 15–30% casualties; a Unit reaching 0 Strength is a bug |

**Pacing** — serves G4

| ID  | Function                                    | Dir | Target |
|-----|---------------------------------------------|:---:|--------|
| F11 | End a battle by Army Break or clock         |  →  | 20–40 min at Tempo 1; never by annihilation |
| F20 | Bring Units onto the Field mid-battle       |  →  | Arrival by clock time or trigger, at a named point or Field edge |

**Watchability** — serves G7

| ID  | Function                                    | Dir | Target |
|-----|---------------------------------------------|:---:|--------|
| F12 | Morph a Unit's slot layout through a Formation change |  →  | rendered across the transition's full duration; nothing pops |
| F13 | Render every Volley as flash and Powder Smoke |  →  | one flash and one drifting cloud per Volley |
| F14 | Interpolate rendering between simulation states |  →  | sim 10Hz, render 60fps, zero judder |
| F15 | Sound every battle event                    |  →  | distinct sound per Volley, gun, Charge, Contact, Rout, Order arrival |

**Authoring & shipping** — serves G5, G6

| ID  | Function                                    | Dir | Target |
|-----|---------------------------------------------|:---:|--------|
| F16 | Load Scenario, Field and Roster entirely from data |  →  | zero code changes to add a battle |
| F17 | Author a Field without hand-editing data    |  ↓  | a 250×250 Field in under an hour |
| F18 | Replay a battle identically from Scenario and seed |  →  | bit-identical outcome |
| F19 | Build to a static site                      |  →  | static assets, no server |

## 4. Cascade — Goals → Functions → How → Components

- **G1** commander, not puppeteer  _W:10_
  - **F1** Deliver an Order on courier time — **How**: an Order is a message stamped with an arrival time, never a call on a Unit → C1, C8
  - **F2** Show every pending Order — **How**: draw the Courier riding and a Ghost at its destination → C11, C15
  - **F3** Cover the gaps with Initiative — **How**: ordered priority rule list, first match wins, *suspending* the live Order rather than cancelling it → C2 _(rejected: behaviour tree, utility scoring — see T14)_
  - **F4** Route a Unit anywhere reachable — **How**: A* over cells with Ground and gradient costs, string-pulled to a few waypoints; Crossings funnel for free because water costs ∞ and a bridge cell does not → C5, C4
- **G2** reads at a glance  _W:9_
  - **F5** Formation readable from silhouette — **How**: the four infantry Formations already have distinct outlines; draw an army-coloured base with Figures as texture, and floor a Figure at 3px so a line never collapses to 2px → C3, C10
  - **F6** Whole Field on one screen — **How**: fixed camera, 1 px/m, no zoom, no pan; Field sized to the window → C9 _(rejected: zoom + pan — see T8)_
  - **F7** Dispatches with cause — **How**: the Initiative rule that fired *is* the reason, so causes come free rather than needing an explanation layer → C12, C2
- **G3** period tactics win  _W:9_
  - **F8** Effects from geometry, not constants — **How**: Frontage, depth and Face derived from Strength, ranks and spacing; a column is butchered by roundshot because it *is* deep, and a square resists cavalry because it *has* no flank → C3, C6
  - **F9** Discrete events on historical clocks — **How**: Volley on a reload clock, Charge as a resolved sequence, Contact decided in seconds → C6, C8
  - **F10** Morale decides, not Strength — **How**: casualties are one input to Morale; Break, Rout, Rally and a falling Morale Ceiling do the rest → C7
- **G4** a battle has shape  _W:8_
  - **F11** End by Army Break or clock — **How**: weighted count of Broken Units per army, plus a Scenario clock, then Key Ground is counted → C7, C8
  - **F20** Arrival — **How**: Roster entries that enter at a named point or Field edge on clock time or trigger → C8, C14, C5
- **G5** authorable as data  _W:7_
  - **F16** Scenario, Field and Roster from data — **How**: Rosters are standalone files a Scenario names, so persistence later is writing them back out → C14
  - **F17** Author a Field without hand-editing data — **How**: `height.png` (low-res, upsampled) + `ground.png` (full-res) painted in any image editor over a traced historical map; discrete objects in `scenario.json` → C14, C4 _(rejected: build a tile editor — see T5)_
  - **F18** Identical replay from Scenario + seed — **How**: pure sim module, fixed 10Hz timestep, seeded RNG → C8
- **G6** a link you can hand over  _W:5_
  - **F19** Static build — **How**: Vite build to static assets, no server → build config
- **G7** good to watch  _W:8_
  - **F12** Morph the slot layout through a Formation change — **How**: Figures stay rigid *in* their slots; the slot layout itself interpolates over the transition's real duration, so a line visibly folds into a square → C3, C10
  - **F13** Volley as flash and Powder Smoke — **How**: discrete Volleys already give the battlefield a beat; one flash and one drifting cloud each → C11
  - **F14** Interpolate rendering between sim states — **How**: renderer draws between the last two states; interpolation never touches the sim → C10, C8
  - **F15** Sound every battle event — **How**: one sound per event type, off the same event stream that feeds Dispatches → C13

## 5. House — Goals × Functions

|  | F1 | F2 | F3 | F4 | F5 | F6 | F7 | F8 | F9 | F10 | F11 | F12 | F13 | F14 | F15 | F16 | F17 | F18 | F19 | F20 |
| :-- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| **G1** (10) | 9 | 9 | 9 | 3 | 1 | 3 | 3 |  | 1 | 1 |  | 1 | 1 |  | 1 |  |  |  |  | 1 |
| **G2** (9) |  | 9 | 1 |  | 9 | 9 | 9 | 3 | 3 | 1 |  | 3 | 9 | 3 | 3 |  |  |  |  | 1 |
| **G3** (9) | 3 |  | 9 | 3 |  |  | 3 | 9 | 9 | 9 | 3 | 1 |  |  |  | 3 | 3 | 9 |  | 3 |
| **G4** (8) | 3 |  | 3 | 1 |  | 1 | 3 |  | 3 | 9 | 9 |  |  |  | 3 | 3 |  |  |  | 9 |
| **G5** (7) |  |  | 3 |  |  | 1 | 1 | 1 |  |  | 3 |  |  |  |  | 9 | 9 | 3 | 1 | 9 |
| **G6** (5) |  |  |  |  |  | 1 |  |  |  |  |  |  |  |  |  | 1 |  |  | 9 |  |
| **G7** (8) | 1 | 3 | 1 | 1 | 3 | 3 | 1 |  | 3 |  |  | 9 | 9 | 9 | 9 |  |  |  |  | 1 |
| **Σ** | 149 | 195 | 233 | 73 | 115 | 155 | 177 | 115 | 166 | 172 | 120 | 118 | 163 | 99 | 133 | 119 | 90 | 102 | 52 | 189 |
| **Rank** | 9 | 2 | 1 | 19 | 14 | 8 | 4 | 15 | 6 | 5 | 11 | 13 | 7 | 17 | 10 | 12 | 18 | 16 | 20 | 3 |

**Top engineering priorities.** Three results are worth arguing with rather than nodding at.

**F3 Initiative ranks first, by a distance.** It is the only function that touches five of the seven goals — it makes delay survivable (G1), it *is* the enemy's tactical competence (G3), its rule names are the causes in every Dispatch (G2), and it is authored as data (G5). That matches the intuition we kept arriving at by feel, which is mildly reassuring about both.

**F20 Arrival ranks third — and it was missing entirely two hours ago.** It only exists because Rivoli was used as a concrete test. Everything above it in the ranking was obvious from the first conversation; the third most important function in the design was not, and would have been found only when the first scenario proved unauthorable.

**F8 ranks fourteenth, which contradicts what I said about it.** I called Formation Geometry the crux and it is — but *not because F8 is important on its own*. F8's value is almost entirely indirect: it feeds F5, F12 and F6 through the component that implements it. The function matrix can't see that, and the component map in §7 can. This is a case where trusting the function ranking alone would send effort to the wrong place.

## 6. Roof — the conflicts that actually shape the design

The full 20×20 grid is in the [annex](#annex--full-roof-grid). Six pairs matter.

**F3 Initiative × G1 the commander fantasy** — the most dangerous tension in the design, and it isn't function-versus-function at all. *The better Initiative gets, the less the player matters.* If battalions reliably do the right thing on their own, the honest question is why you're there. The resolution: **Initiative is strictly defensive.** It preserves — returns fire, forms square, breaks, routs, rallies, picks a travelling Formation. It never advances, never takes ground, never chooses an objective, never exploits. Every act of *intent* stays yours and costs a courier ride.

**F8 geometry-derived × F10 / F11 hitting the targets** — F8 wants zero hard-coded Formation constants; F10 wants Units breaking at 15–30% casualties and F11 wants battles landing in 20–40 minutes. With everything derived, there are almost no knobs left to hit those numbers with. Resolution: **geometry sets relative effect, a small set of global scalars sets absolute magnitude.** The moment a *per-Formation* constant is needed, F8 has failed and we should know it.

**F1 courier delay × F11 battle length** — a 1500m Order takes ~115 seconds. In a 20-minute battle that is roughly ten order-cycles to your far flank, and fewer once you count thinking time. More delay is more fiction and fewer decisions. Unresolved; both numbers are tuned against Castiglione.

**F13 Powder Smoke × F5 silhouette** — smoke does not blind the *simulation*, but drawn over the field it obscures the silhouettes G2 depends on, and it is thickest exactly where the fighting is. Mitigation: capped opacity, drawn behind Unit bases. Watch it.

**F14 render interpolation × F18 deterministic replay** — not a conflict if the discipline holds, and a nasty one if it doesn't. Interpolated positions must never feed back into the simulation. One accidental read of a rendered position and replays diverge.

**F11 Army Break × F20 Arrival** — an army can be one Unit from Army Break with a fresh column ninety seconds off the Field edge. That's a *feature* — it's what Rivoli and Castiglione both turn on — but it means the end condition has to consider what is still on the road, or battles will end one minute before their best moment.

## 7. Components & Function → Component map

| ID  | Component            | Owns                                                                  | ADR |
|-----|----------------------|-----------------------------------------------------------------------|-----|
| C1  | Order Delivery       | Orders, Couriers, the arrival queue, suspend and resume                | [0002](./docs/adr/0002-orders-are-couriered-from-a-headquarters.md) |
| C2  | Initiative Rules     | the ordered rule list and its thresholds by Grade                      | [0004](./docs/adr/0004-initiative-is-an-ordered-rule-list.md) |
| C3  | Formation Geometry   | slot layouts, Frontage, Footprint, Faces, wheeling, morphing           | [0001](./docs/adr/0001-unit-is-always-a-battalion.md) |
| C4  | Field                | cell grid, Ground, Height, gradient, impassability, Concealment         | — |
| C5  | Routing              | A* over cells, string-pulling, funnelling to Crossings                  | — |
| C6  | Fighting             | Volley, Charge, Contact — every effect derived from C3's geometry       | — |
| C7  | Morale               | Morale, Fatigue, Disorder, Break, Rout, Rally, Morale Ceiling, Army Break | — |
| C8  | Battle Clock         | fixed timestep, Tempo, Arrivals, Plan triggers, end conditions, seed    | [0003](./docs/adr/0003-typescript-with-a-pure-simulation-core.md) |
| C9  | Field Renderer       | terrain drawn from the grid                                            | — |
| C10 | Unit Renderer        | silhouette, base, Figures, render interpolation                        | — |
| C11 | Effects              | muzzle flash, Powder Smoke, Couriers, Ghosts                           | [0002](./docs/adr/0002-orders-are-couriered-from-a-headquarters.md) |
| C12 | Dispatch Panel       | the feed, fed by named Initiative rules and sim events                  | — |
| C13 | Sound                | one sound per event type                                               | — |
| C14 | Scenario Loader      | height.png, ground.png, scenario.json, Rosters                          | [0005](./docs/adr/0005-terrain-is-authored-as-images.md) |
| C15 | Order Input          | selection, the click-drag grammar, Ghost placement                      | — |

Component Σ = Σ(function Σ from §5 × strength), so priorities are carried down rather than asserted.

|  | C1 | C2 | C3 | C4 | C5 | C6 | C7 | C8 | C9 | C10 | C11 | C12 | C13 | C14 | C15 |
| :-- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| F1 | 9 |  |  |  |  |  |  | 3 |  |  |  |  |  |  | 3 |
| F2 | 9 |  |  |  |  |  |  |  |  |  | 9 |  |  |  | 9 |
| F3 | 3 | 9 |  |  |  |  | 3 |  |  |  |  |  |  |  |  |
| F4 |  |  | 3 | 9 | 9 |  |  |  |  |  |  |  |  |  |  |
| F5 |  |  | 9 | 1 |  |  |  |  | 3 | 9 |  |  |  |  | 1 |
| F6 |  |  | 3 | 3 |  |  |  |  | 9 | 9 |  |  |  |  |  |
| F7 |  | 9 |  |  |  |  | 3 |  |  |  |  | 9 |  |  |  |
| F8 |  |  | 9 | 3 |  | 9 |  |  |  |  |  |  |  |  |  |
| F9 |  | 1 | 3 |  |  | 9 |  | 3 |  |  |  |  |  |  |  |
| F10 |  | 3 | 1 |  |  | 3 | 9 |  |  |  |  |  |  |  |  |
| F11 |  |  |  |  |  |  | 9 | 9 |  |  |  |  |  |  |  |
| F12 |  |  | 9 |  |  |  |  |  |  | 9 | 1 |  |  |  |  |
| F13 |  |  |  |  |  | 3 |  |  |  |  | 9 |  |  |  |  |
| F14 |  |  |  |  |  |  |  | 9 |  | 9 |  |  |  |  |  |
| F15 |  |  |  |  |  |  |  |  |  |  |  |  | 9 |  |  |
| F16 |  |  |  |  |  |  |  |  |  |  |  |  |  | 9 |  |
| F17 |  |  |  | 3 |  |  |  |  |  |  |  |  |  | 9 |  |
| F18 |  |  |  |  |  |  |  | 9 |  |  |  |  |  | 3 |  |
| F20 | 1 |  |  |  | 3 |  |  | 9 |  |  |  |  |  | 3 |  |
| **Σ** | 3984 | 4372 | 4486 | 1852 | 1224 | 3534 | 3858 | 5535 | 1740 | 4383 | 3340 | 1593 | 1197 | 2754 | 2317 |
| **Rank** | 5 | 4 | 2 | 11 | 14 | 7 | 6 | 1 | 12 | 3 | 8 | 13 | 15 | 9 | 10 |

**Where the engineering effort goes.**

**C8 Battle Clock ranks first, which is a genuinely useful surprise.** It sounds like plumbing. It is in fact the only component touching all four of the highest-leverage things in the design at once: it schedules Arrivals (F20, rank 3), it owns the fixed timestep that makes replay possible (F18) and the interpolation that makes the game watchable (F14), and it holds the end conditions (F11). Nothing in the session suggested building it first — the ranking did.

**C3 Formation Geometry ranks second, vindicating the claim F8 alone couldn't support.** Its value is aggregated across F5, F8 and F12: silhouette, geometry-derived combat and the morph are the same slot layouts read three ways. Build it first anyway, C8 notwithstanding, because C6 and C10 are both meaningless without it.

**C5 Routing ranks fourteenth**, which is worth internalising: pathfinding is the classic thing to sink three weeks into, and by this ranking it earns about as much attention as the sound effects. String-pull an A* and move on.

**The ranking disagrees with the natural build order in one place.** C14 Scenario Loader ranks ninth, but nothing can be tested against Castiglione or Rivoli until it exists. Ranking measures value, not sequencing.

## 8. Critical performance budget

| Rank | Function | Target | Watched on | If we miss it |
|------|----------|--------|-----------|----------------|
| 1 | F1 courier delay | 200m ≈ 15s, 1500m ≈ 115s | the bridge-march fixture | Cap the ride, or flatten toward a constant. **If delay still isn't fun after tuning, the central bet has failed and everything downstream reopens.** This is the one to test first and the reason milestone 1 has no combat in it. |
| 2 | F3 Initiative | never idle under threat; every act explainable by the rule that fired | both fixtures, then Castiglione | Shorten the list and promote the missing behaviour to an explicit Order. If the list passes ~20 rules or becomes order-fragile, revisit T14. |
| 3 | F20 Arrival | by clock time or trigger, at a point or edge | Rivoli | Hand-place arriving Units at Deployment. Rivoli and Castiglione both become un-authorable; the campaign shrinks to Lodi and Arcole. |
| 4 | F10 Morale | Break at 15–30% casualties; 0 Strength is a bug | Castiglione | Add global Morale scalars. If per-Formation constants are needed, F8 has failed — record it. |
| 5 | F11 battle length | 20–40 min at Tempo 1 | Castiglione | Raise default Tempo, then shorten the Scenario clock. Both are data. |
| 6 | F6 Field on one screen | ≤1920m, 60fps | Rivoli — the largest Field in the campaign | Add zoom and pan, and accept that G2's silhouette guarantee weakens with it (T8). |
| 7 | F5 silhouette | 4 infantry silhouettes distinct at 1 px/m; Figure ≥ 3px | Rivoli | Add an army-coloured base outline, then a Formation glyph. Adding the glyph means G2 is being carried by UI rather than by the game. |
| 8 | F4 routing | under 5ms on 250×250 | Rivoli — gorges are the worst case | Precompute a flow field per Crossing. Cheap, and it makes funnelling exact. |
| 9 | F14 interpolation | zero judder at 10Hz sim / 60fps render | any scenario | Raise the sim to 20Hz. Costs determinism nothing; costs CPU almost nothing at 40 bodies. |
| 10 | F17 Field authoring | a Field in under an hour | Rivoli — hand-painting 200m of relief | Build the tile editor after all, reinstating the cost ADR-0003 flagged. |

### Measured so far

Milestone 1 only, on the bridge-march fixture.

| Rank | Target | Measured | Where |
|------|--------|----------|-------|
| 1 | F1 courier delay: 200m ≈ 15s, 1500m ≈ 115s | 15.0s and 115.0s | `src/sim/sim.test.ts` |
| 8 | F4 routing under 5ms on 250×250 | 2.1ms, worst case corner to corner past one bridge | `src/sim/routing.perf.test.ts` |

Rank 1's real question — whether the delay is *fun* — was answered by playing the fixture, and
it is. The central bet holds: an Order that takes a minute and a half to arrive is a game. Nothing
downstream reopens, so the cascade stands as scored.

Two of §9's triggers are still unmeasured, and both are cheap: how many order-cycles a 20-minute
battle allows to the far flank, and whether the fixture resolves much the same with no Orders
issued at all.

## 9. Tradeoffs — Got / Paid / ADR

| ID | Tradeoff | Got | Paid | ADR |
|----|----------|-----|------|-----|
| T1 | Rigid blocks over agent soldiers | ~40 simulated bodies; no per-man steering, collision or pathing; exact Formations | no emergent melee churn or rout scatter; Contact must be abstract | — |
| T2 | Figures rigid in their slots | trivial rendering, exact geometry | transitions must be morphed by C3 or Formations visibly pop | — |
| T3 | Scripted Plan over tactical AI | no planning AI to write; scenarios become authorable content | no adaptation; a battle is fresh once or twice; no skirmish generator | — |
| T4 | TypeScript over Godot | velocity in a known stack; ships as a link; pure testable sim | no editor for free — mitigated by T5 | [0003](./docs/adr/0003-typescript-with-a-pure-simulation-core.md) |
| T5 | Terrain painted as images over a built editor | F17 drops from "build an editor" to "write a loader"; historical maps can be traced | terrain is opaque in diffs and ungreppable | [0005](./docs/adr/0005-terrain-is-authored-as-images.md) |
| T6 | Three Grades over five | one fewer axis to balance | Jeune and Vieille Garde collapse into one rung | — |
| T7 | Whole-battalion Open Order over detached skirmishers | "one Unit, one Formation" holds | no screen-plus-main-body; a battalion skirmishes entirely or not at all | — |
| T8 | Fixed camera over zoom and pan | zero camera work; forces legibility at the hardest scale first | Field capped at ~1920m, so Austerlitz and Leipzig need named sub-actions or a different game | — |
| T9 | Terrain-only Concealment over fog of war | no scouting, ghosts or report decay; one uncertainty layer instead of two | no intelligence to gather; every ambush is readable off the map by a careful player | — |
| T10 | Powder Smoke drawn but inert | legibility preserved; one accumulator instead of an occlusion field | the firefight-stalemate dynamic isn't modelled — the dial exists and starts at zero | — |
| T11 | Morale as the health bar, not casualties | the period's actual dynamic; Pursuit and Rally become real decisions | harder to tune; no legible bar the player can count down | — |
| T12 | Unit sized by a Frontage band, not a historical title | one model across every army and campaign | an Austrian cavalry regiment is four Units, which reads oddly on a roster | [0001](./docs/adr/0001-unit-is-always-a-battalion.md) |
| T13 | No save | no serialisation of simulation state at all | a 40-minute battle is all-or-nothing | — |
| T14 | Rule list over behaviour tree or utility scoring | every autonomous act has a nameable cause, so F7 is free; deterministic; authorable as data | no subtlety and no coordination between Units; the list grows long and order-sensitive | [0004](./docs/adr/0004-initiative-is-an-ordered-rule-list.md) |
| T15 | Two nominals plus fixtures over one nominal | honest coverage — Rivoli under-tests exactly what Castiglione tests | two Fields to author before the design is validated at all | — |

### Tensions being watched (unresolved by design)

- **Initiative versus player agency.** Held at bay by keeping Initiative strictly defensive — it preserves, never advances. **Trigger to revisit:** a playtest where the battle resolves much the same whether the player issues Orders or not.
- **Courier delay versus battle length.** Both tuned against Castiglione, in opposite directions. **Trigger:** when a 20-minute battle allows fewer than about three order-cycles to the far flank.
- **Geometry purity versus tunability.** Global scalars only, so far. **Trigger:** the first time a target can only be hit with a *per-Formation* constant — at which point F8 is dead and should be struck rather than quietly fudged.
- **Powder Smoke versus silhouette legibility.** Capped opacity, drawn behind Unit bases. **Trigger:** when smoke makes the decisive point of the Field unreadable.
- **Smoke as a blinding mechanic.** Deliberately not built; the dial sits at zero. **Trigger:** if firefights resolve faster and more decisively than the period suggests they should.
- **Campaign persistence.** Rosters are already standalone files, so the door is open. **Trigger:** wanting casualties from Lodi to still be missing at Castiglione.

## 10. Inconsistencies spotted and fixed

- **"Soldier" meant two different things.** Defined as "one man in a Unit", then used as "one drawn figure per five men" — so `unit.soldiers.length` would never have been a Unit's Strength. Renamed to **Figure**; Strength counts men only.
- **"Rigid men" read as popping Formations.** Figures snapping to slots, taken literally, means a battalion holds its line for forty seconds and then jumps into a square — violating G7. Resolved: Figures are rigid *relative to* their slots; the slot layout itself morphs (F12).
- **ADR-0003 mandated a fixed timestep without mandating interpolation.** At 10Hz, drawing simulation positions directly judders regardless of frame rate. F14 added and the ADR amended.
- **Crossing was defined too narrowly.** "A passable strip over impassable *Ground*" — but Rivoli's Osteria gorge is passable ground between impassable *slopes*. Widened: impassability comes from Ground **or** gradient, so a cliff is a Height, not a Ground.
- **Concealment claimed terrain was the only thing that hides anything.** Powder Smoke would have falsified it. Resolved by keeping smoke inert rather than by weakening the claim.
- **"A Unit is a battalion" was a French assumption.** Austrian cavalry regiments ran 1,000–1,400 men against a French 250, so no historical title unifies across armies. Resolved to a derived **Frontage** band with size as Roster data.
- **G4 had no functions.** "A battle has a shape" survived the whole functions pass unserved, and was only filled when Rivoli proved unauthorable without **Arrival** — which then ranked third overall.
- **Rivoli was claimed to test everything.** It under-tests Formation play and cavalry badly, because its slopes leave little manoeuvrable ground. Resolved with two nominals and purpose-built fixtures.
- **Three terms were tourism, not domain.** "Point of interest" → **Key Ground**; "smog" → **Powder Smoke**; "event feed" → **Dispatch**.
- **Initiative's effect on a live Order was never stated.** Cancelling would strand a battalion in square in an empty field until a new Order arrived ninety seconds later. Resolved: Initiative **suspends**, never cancels.

---

## Annex — full roof grid

Symbols: `◎` strong reinforcement · `○` mild reinforcement · `×` mild conflict · `⊗` strong conflict.

|  | F1 | F2 | F3 | F4 | F5 | F6 | F7 | F8 | F9 | F10 | F11 | F12 | F13 | F14 | F15 | F16 | F17 | F18 | F19 | F20 |
| :-- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| **F1** | — | ◎ | ◎ |  |  |  |  |  |  |  | × |  |  |  | ○ |  |  |  |  |  |
| **F2** |  | — | ○ |  |  |  |  |  |  |  | ○ |  | × |  |  |  |  |  |  |  |
| **F3** |  |  | — |  |  |  | ◎ |  |  |  | ○ |  |  |  |  |  |  |  |  |  |
| **F4** |  |  |  | — |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | ○ |
| **F5** |  |  |  |  | — | × |  |  |  |  |  | ◎ | × |  |  |  |  |  |  |  |
| **F6** |  |  |  |  |  | — |  |  |  |  |  |  | × | ○ |  |  |  |  |  |  |
| **F7** |  |  |  |  |  |  | — | × |  |  |  |  |  |  |  |  |  |  |  |  |
| **F8** |  |  |  |  |  |  |  | — | ◎ | × | × |  |  |  |  |  |  | ◎ |  |  |
| **F9** |  |  |  |  |  |  |  |  | — |  |  |  | ◎ |  | ◎ |  |  |  |  |  |
| **F10** |  |  |  |  |  |  |  |  |  | — | ◎ |  |  |  |  |  |  |  |  |  |
| **F11** |  |  |  |  |  |  |  |  |  |  | — |  |  |  |  |  |  |  |  | × |
| **F12** |  |  |  |  |  |  |  |  |  |  |  | — |  | ◎ |  |  |  |  |  |  |
| **F13** |  |  |  |  |  |  |  |  |  |  |  |  | — | ○ |  |  |  |  |  |  |
| **F14** |  |  |  |  |  |  |  |  |  |  |  |  |  | — |  |  |  | × |  |  |
| **F15** |  |  |  |  |  |  |  |  |  |  |  |  |  |  | — |  |  |  |  |  |
| **F16** |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | — | ◎ |  |  | ◎ |
| **F17** |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | — | ○ |  |  |
| **F18** |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | — |  |  |
| **F19** |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | — |  |
| **F20** |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | — |

---

## How to keep this honest

- When a new ADR lands → add its components to §7 and re-score the affected rows.
- When a spike or a measurement returns numbers → update §8's `Target` and `Watched on`.
- Goals change rarely; Functions change with each release; the matrices are recomputed when either side moves.
- If a section goes empty after edits, delete it — empty sections lie.

